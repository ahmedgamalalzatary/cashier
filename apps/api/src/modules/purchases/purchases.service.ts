import { createHash } from 'node:crypto';
import { HttpError } from '../../middleware/error.js';
import type { PurchasesRepository } from './purchases.repository.js';
import type { PurchaseInput } from './purchases.schemas.js';

const formatScaled = (value: bigint, scale: number) => {
  const divisor = 10n ** BigInt(scale);
  return `${value / divisor}.${(value % divisor).toString().padStart(scale, '0')}`;
};
const numberToScaled = (value: number, scale: number) =>
  BigInt(value.toFixed(scale).replace('.', ''));
const stringToScaled = (value: string, scale: number) => {
  const [whole, fraction = ''] = value.split('.');
  return (
    BigInt(whole) * 10n ** BigInt(scale) +
    BigInt(fraction.padEnd(scale, '0').slice(0, scale))
  );
};
const divideRounded = (numerator: bigint, denominator: bigint) =>
  (numerator + denominator / 2n) / denominator;
const isDuplicateEntry = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 'ER_DUP_ENTRY';
const requestFingerprint = (data: PurchaseInput) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        supplierId: data.supplierId,
        invoiceNumber: data.invoiceNumber ?? null,
        purchasedAt: data.purchasedAt,
        paidAmount: data.paidAmount,
        notes: data.notes ?? null,
        lines: [...data.lines].sort((a, b) => a.itemId - b.itemId),
      }),
    )
    .digest('hex');
const MAX_INVOICE_CENTS = 999_999_999_999n;
const MAX_STOCK_QUANTITY_MILLI = 99_999_999_999_999n;
const MAX_UNIT_COST_SCALED = 9_999_999_999_999_999n;

export class PurchasesService {
  constructor(private repo: PurchasesRepository) {}

  async create(data: PurchaseInput, createdBy: number) {
    const fingerprint = requestFingerprint(data);
    try {
      return await this.repo.transaction(async (repo, inventory) => {
        const replay = await repo.findByClientRequestId(data.clientRequestId);
        if (replay) {
          this.assertReplay(replay, fingerprint, createdBy);
          return replay.id;
        }
        const supplier = await repo.findSupplierForUpdate(data.supplierId);
      if (!supplier) throw new HttpError(404, 'المورد غير موجود');
      if (!supplier.isActive) throw new HttpError(409, 'المورد موقوف');
      if (
        data.invoiceNumber &&
        (await repo.hasInvoiceNumber(data.supplierId, data.invoiceNumber))
      ) {
        throw new HttpError(409, 'رقم الفاتورة مسجل لهذا المورد من قبل');
      }

      const itemRows = await repo.lockItems(
        data.lines.map((line) => line.itemId),
      );
      const itemsById = new Map(itemRows.map((item) => [item.id, item]));
      const calculatedLines = data.lines.map((line) => {
        const item = itemsById.get(line.itemId);
        if (!item) throw new HttpError(404, 'أحد الأصناف غير موجود');
        if (!item.isActive)
          throw new HttpError(409, `الصنف "${item.id}" موقوف`);
        if (item.type === 'prepared')
          throw new HttpError(409, 'لا يمكن شراء صنف مُحضّر');

        const enteredQuantity = numberToScaled(line.quantity, 3);
        let stockQuantity = enteredQuantity;
        if (line.unitMode === 'purchase') {
          if (!item.purchaseUnit || !item.purchaseToStockFactor) {
            throw new HttpError(409, 'الصنف لا يملك وحدة شراء');
          }
          const product =
            enteredQuantity * stringToScaled(item.purchaseToStockFactor, 6);
          if (product % 1_000_000n !== 0n) {
            throw new HttpError(
              400,
              'الكمية بعد تحويل وحدة الشراء تتجاوز ثلاث خانات عشرية',
            );
          }
          stockQuantity = product / 1_000_000n;
        }
        const unitPrice = numberToScaled(line.unitPrice, 2);
        const lineTotal = divideRounded(enteredQuantity * unitPrice, 1_000n);
        const unitCost = divideRounded(lineTotal * 10_000_000n, stockQuantity);
        if (stockQuantity > MAX_STOCK_QUANTITY_MILLI) {
          throw new HttpError(400, 'الكمية المحولة خارج النطاق المسموح');
        }
        if (unitCost > MAX_UNIT_COST_SCALED) {
          throw new HttpError(400, 'تكلفة وحدة المخزون خارج النطاق المسموح');
        }
        return {
          ...line,
          quantityText: formatScaled(enteredQuantity, 3),
          stockQuantityText: formatScaled(stockQuantity, 3),
          unitPriceText: formatScaled(unitPrice, 2),
          lineTotal,
          lineTotalText: formatScaled(lineTotal, 2),
          unitCostText: formatScaled(unitCost, 6),
        };
      });

      const totalAmount = calculatedLines.reduce(
        (total, line) => total + line.lineTotal,
        0n,
      );
      if (totalAmount > MAX_INVOICE_CENTS) {
        throw new HttpError(400, 'إجمالي الفاتورة خارج النطاق المسموح');
      }
      const paidAmount = numberToScaled(data.paidAmount, 2);
      if (paidAmount > totalAmount) {
        throw new HttpError(400, 'المبلغ المدفوع أكبر من إجمالي الفاتورة');
      }

      const invoiceId = await repo.createInvoice({
        supplierId: data.supplierId,
        invoiceNumber: data.invoiceNumber ?? null,
        purchasedAt: data.purchasedAt,
        notes: data.notes ?? null,
        totalAmount: formatScaled(totalAmount, 2),
        paidAmount: formatScaled(paidAmount, 2),
        createdBy,
        clientRequestId: data.clientRequestId,
        requestFingerprint: fingerprint,
      });
      const occurredAt = new Date(`${data.purchasedAt}T00:00:00.000Z`);
      for (const line of calculatedLines) {
        await repo.createLine({
          invoiceId,
          itemId: line.itemId,
          quantity: line.quantityText,
          unitMode: line.unitMode,
          stockQuantity: line.stockQuantityText,
          unitPrice: line.unitPriceText,
          unitCost: line.unitCostText,
          lineTotal: line.lineTotalText,
        });
        await inventory.receive({
          itemId: line.itemId,
          warehouse: 'main',
          quantity: Number(line.stockQuantityText),
          unitCost: line.unitCostText,
          movementType: 'purchase',
          referenceType: 'purchase_invoice',
          referenceId: invoiceId,
          notes: null,
          occurredAt,
        });
      }
      if (paidAmount > 0n) {
        await repo.createPayment({
          supplierId: data.supplierId,
          purchaseInvoiceId: invoiceId,
          amount: formatScaled(paidAmount, 2),
          paidAt: data.purchasedAt,
        });
      }
      return invoiceId;
      });
    } catch (error) {
      if (!isDuplicateEntry(error)) throw error;
      // a concurrent retry with the same key lost the insert race — replay it
      const replay = await this.repo.findByClientRequestId(
        data.clientRequestId,
      );
      if (replay) {
        this.assertReplay(replay, fingerprint, createdBy);
        return replay.id;
      }
      // the unique (supplierId, invoiceNumber) index tripped instead
      throw new HttpError(409, 'رقم الفاتورة مسجل لهذا المورد من قبل');
    }
  }

  private assertReplay(
    replay: { createdBy: number; requestFingerprint: string },
    fingerprint: string,
    createdBy: number,
  ) {
    if (replay.requestFingerprint !== fingerprint) {
      throw new HttpError(409, 'معرّف الطلب مستخدم لبيانات شراء مختلفة');
    }
    if (replay.createdBy !== createdBy) {
      throw new HttpError(409, 'معرّف الطلب مستخدم من مستخدم آخر');
    }
  }

  list() {
    return this.repo.list();
  }

  async get(id: number) {
    const invoice = await this.repo.findById(id);
    if (!invoice) throw new HttpError(404, 'فاتورة الشراء غير موجودة');
    return { ...invoice, lines: await this.repo.listLines(id) };
  }
}
