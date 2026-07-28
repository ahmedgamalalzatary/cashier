import { createHash, randomUUID } from "node:crypto";
import { HttpError } from "../../middleware/error.js";
import type { FifoAllocation } from "../inventory/inventory.service.js";
import type { OrdersRepository } from "./orders.repository.js";
import type { OrderInput } from "./orders.schemas.js";

const formatScaled = (value: bigint, scale: number) => {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const divisor = 10n ** BigInt(scale);
  return `${negative ? "-" : ""}${absolute / divisor}.${(absolute % divisor)
    .toString()
    .padStart(scale, "0")}`;
};
const scaled = (value: string | number, scale: number) =>
  BigInt(Number(value).toFixed(scale).replace(".", ""));
const roundDivide = (numerator: bigint, denominator: bigint) =>
  (numerator + denominator / 2n) / denominator;
const duplicate = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "ER_DUP_ENTRY";

function normalizeLines(lines: OrderInput["lines"]) {
  const combined = new Map<number, number>();
  for (const line of lines)
    combined.set(
      line.variantId,
      (combined.get(line.variantId) ?? 0) + line.quantity,
    );
  return [...combined].map(([variantId, quantity]) => ({
    variantId,
    quantity,
  }));
}
function fingerprint(data: OrderInput) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        lines: data.lines,
        discount: data.discount,
        cashReceived: data.cashReceived,
      }),
    )
    .digest("hex");
}

export class OrdersService {
  constructor(private repo: OrdersRepository) {}

  async catalog() {
    const rows = await this.repo.listCatalogItems();
    return rows.map((row) => ({
      ...row,
      mainCategoryId: row.parentCategoryId ?? row.categoryId,
      mainCategoryName: row.parentCategoryName ?? row.categoryName,
      subCategoryId: row.parentCategoryId === null ? null : row.categoryId,
      subCategoryName:
        row.parentCategoryId === null ? null : row.categoryName,
    }));
  }

  async create(data: OrderInput, cashierId: number) {
    const requestFingerprint = fingerprint(data);
    let orderId: number;
    try {
      orderId = await this.repo.transaction(async (repo, inventory) => {
        const existing = await repo.findByClientRequestId(data.clientRequestId);
        if (existing) {
          if (
            existing.requestFingerprint !== requestFingerprint ||
            existing.cashierId !== cashierId
          )
            throw new HttpError(409, "معرّف الطلب مستخدم لعملية بيع مختلفة");
          return existing.id;
        }
        const shift = await repo.findOpenShiftForCashier(cashierId);
        if (!shift)
          throw new HttpError(409, "يجب فتح وردية قبل تسجيل البيع");
        const normalized = normalizeLines(data.lines);
        if (normalized.some((line) => line.quantity > 999))
          throw new HttpError(400, "كمية المتغير خارج النطاق المسموح");
        const variants = await repo.lockItems(
          normalized.map((line) => line.variantId),
        );
        const byId = new Map(variants.map((row) => [row.id, row]));
        const calculated = normalized.map((line) => {
          const variant = byId.get(line.variantId);
          if (!variant) throw new HttpError(404, "متغير المنتج غير موجود");
          if (!variant.isActive || !variant.productIsActive)
            throw new HttpError(409, "متغير المنتج غير متاح للبيع");
          const quantity = scaled(line.quantity, 3);
          const unitPrice = scaled(variant.sellingPrice, 2);
          return {
            ...line,
            ...variant,
            quantityText: formatScaled(quantity, 3),
            unitPriceText: formatScaled(unitPrice, 2),
            subtotal: roundDivide(quantity * unitPrice, 1_000n),
          };
        });
        const subtotal = calculated.reduce((sum, row) => sum + row.subtotal, 0n);
        let discountValue: bigint | null = null;
        let discountAmount = 0n;
        if (data.discount) {
          discountValue = scaled(data.discount.value, 2);
          discountAmount =
            data.discount.type === "percent"
              ? roundDivide(subtotal * discountValue, 10_000n)
              : discountValue;
          if (discountAmount > subtotal)
            throw new HttpError(400, "الخصم أكبر من إجمالي الطلب");
        }
        const total = subtotal - discountAmount;
        const received = scaled(data.cashReceived, 2);
        if (received < total)
          throw new HttpError(400, "المبلغ المستلم أقل من إجمالي الطلب");
        const occurredAt = new Date();
        orderId = await repo.createOrder({
          orderNumber: `POS-${occurredAt.toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`,
          clientRequestId: data.clientRequestId,
          requestFingerprint,
          cashierId,
          shiftId: shift.id,
          subtotal: formatScaled(subtotal, 2),
          discountType: data.discount?.type ?? null,
          discountValue:
            discountValue === null ? null : formatScaled(discountValue, 2),
          discountAmount: formatScaled(discountAmount, 2),
          total: formatScaled(total, 2),
          cashReceived: formatScaled(received, 2),
          changeAmount: formatScaled(received - total, 2),
          totalCost: "0.00",
          isNegativeStock: false,
          createdAt: occurredAt,
        });
        let totalCost = 0n;
        let hasDeficit = false;
        for (const line of calculated) {
          const lineId = await repo.createLine({
            orderId,
            itemId: line.variantId,
            productName: line.productName,
            colorName: line.colorName,
            sizeName: line.sizeName,
            variantCode: line.code,
            barcode: line.barcode,
            quantity: line.quantityText,
            unitPrice: line.unitPriceText,
            lineSubtotal: formatScaled(line.subtotal, 2),
            totalCost: "0.00",
            hasStockDeficit: false,
          });
          const consumed = await inventory.consume({
            itemId: line.variantId,
            warehouse: "shop",
            quantity: line.quantity,
            movementType: "sale",
            referenceType: "order",
            referenceId: orderId,
            notes: null,
            occurredAt,
            allowNegative: true,
          });
          const lineCost = scaled(consumed.totalCost, 2);
          const lineDeficit = consumed.allocations.some(
            (allocation) => allocation.batchId === null,
          );
          for (const allocation of consumed.allocations)
            await this.saveAllocation(
              repo,
              lineId,
              line.variantId,
              `${line.productName} - ${line.colorName} - ${line.sizeName}`,
              allocation,
            );
          await repo.updateLine(lineId, {
            totalCost: formatScaled(lineCost, 2),
            hasStockDeficit: lineDeficit,
          });
          totalCost += lineCost;
          hasDeficit ||= lineDeficit;
        }
        await repo.updateOrder(orderId, {
          totalCost: formatScaled(totalCost, 2),
          isNegativeStock: hasDeficit,
        });
        return orderId;
      });
    } catch (error) {
      if (!duplicate(error)) throw error;
      const existing = await this.repo.findByClientRequestId(
        data.clientRequestId,
      );
      if (
        !existing ||
        existing.requestFingerprint !== requestFingerprint ||
        existing.cashierId !== cashierId
      )
        throw error;
      orderId = existing.id;
    }
    return this.get(orderId);
  }

  private saveAllocation(
    repo: OrdersRepository,
    orderLineId: number,
    variantId: number,
    variantName: string,
    allocation: FifoAllocation,
  ) {
    return repo.createAllocation({
      orderLineId,
      itemId: variantId,
      itemName: variantName,
      batchId: allocation.batchId,
      stockMovementId: allocation.movementId,
      quantity: allocation.quantity,
      unitCost: allocation.unitCost,
    });
  }

  list() {
    return this.repo.listRecent();
  }
  async get(id: number) {
    const order = await this.repo.findOrder(id);
    if (!order) throw new HttpError(404, "الطلب غير موجود");
    const lines = await this.repo.listLines(id);
    const allocations = await this.repo.listAllocations(
      lines.map((line) => line.id),
    );
    return {
      ...order,
      lines: lines.map((line) => ({
        ...line,
        variantId: line.itemId,
        allocations: allocations.filter(
          (allocation) => allocation.orderLineId === line.id,
        ),
      })),
    };
  }
}
