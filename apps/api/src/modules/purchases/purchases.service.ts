import { HttpError } from "../../middleware/error.js";
import type { PurchasesRepository } from "./purchases.repository.js";
import type { PurchaseInput } from "./purchases.schemas.js";

const formatScaled = (value: bigint, scale: number) => {
  const divisor = 10n ** BigInt(scale);
  return `${value / divisor}.${(value % divisor).toString().padStart(scale, "0")}`;
};
const scaled = (value: number, scale: number) =>
  BigInt(value.toFixed(scale).replace(".", ""));
const divideRounded = (numerator: bigint, denominator: bigint) =>
  (numerator + denominator / 2n) / denominator;

export class PurchasesService {
  constructor(private repo: PurchasesRepository) {}

  create(data: PurchaseInput, createdBy: number) {
    return this.repo.transaction(async (repo, inventory) => {
      const supplier = await repo.findSupplierForUpdate(data.supplierId);
      if (!supplier) throw new HttpError(404, "المورد غير موجود");
      if (!supplier.isActive) throw new HttpError(409, "المورد موقوف");
      if (
        data.invoiceNumber &&
        (await repo.hasInvoiceNumber(data.supplierId, data.invoiceNumber))
      )
        throw new HttpError(409, "رقم الفاتورة مسجل لهذا المورد من قبل");

      const variants = await repo.lockItems(
        data.lines.map((line) => line.variantId),
      );
      const byId = new Map(variants.map((row) => [row.id, row]));
      const lines = data.lines.map((line) => {
        const variant = byId.get(line.variantId);
        if (!variant) throw new HttpError(404, "أحد متغيرات المنتج غير موجود");
        if (!variant.isActive || !variant.productIsActive)
          throw new HttpError(409, "أحد متغيرات المنتج موقوف");
        const quantity = scaled(line.quantity, 3);
        const unitPrice = scaled(line.unitPrice, 2);
        const lineTotal = divideRounded(quantity * unitPrice, 1_000n);
        return {
          ...line,
          quantityText: formatScaled(quantity, 3),
          unitPriceText: formatScaled(unitPrice, 2),
          unitCostText: formatScaled(unitPrice * 10_000n, 6),
          lineTotal,
          lineTotalText: formatScaled(lineTotal, 2),
        };
      });
      const total = lines.reduce((sum, line) => sum + line.lineTotal, 0n);
      const paid = scaled(data.paidAmount, 2);
      if (paid > total)
        throw new HttpError(400, "المبلغ المدفوع أكبر من إجمالي الفاتورة");
      const invoiceId = await repo.createInvoice({
        supplierId: data.supplierId,
        invoiceNumber: data.invoiceNumber ?? null,
        purchasedAt: data.purchasedAt,
        notes: data.notes ?? null,
        totalAmount: formatScaled(total, 2),
        paidAmount: formatScaled(paid, 2),
        createdBy,
      });
      const occurredAt = new Date(`${data.purchasedAt}T00:00:00.000Z`);
      for (const line of lines) {
        await repo.createLine({
          invoiceId,
          itemId: line.variantId,
          quantity: line.quantityText,
          unitPrice: line.unitPriceText,
          unitCost: line.unitCostText,
          lineTotal: line.lineTotalText,
        });
        await inventory.receive({
          itemId: line.variantId,
          warehouse: "main",
          quantity: line.quantity,
          unitCost: line.unitCostText,
          movementType: "purchase",
          referenceType: "purchase_invoice",
          referenceId: invoiceId,
          notes: null,
          occurredAt,
        });
      }
      if (paid > 0n)
        await repo.createPayment({
          supplierId: data.supplierId,
          purchaseInvoiceId: invoiceId,
          amount: formatScaled(paid, 2),
          paidAt: data.purchasedAt,
        });
      return invoiceId;
    });
  }

  list() {
    return this.repo.list();
  }

  async get(id: number) {
    const invoice = await this.repo.findById(id);
    if (!invoice) throw new HttpError(404, "فاتورة الشراء غير موجودة");
    return { ...invoice, lines: await this.repo.listLines(id) };
  }
}
