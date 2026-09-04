import { createHash, randomUUID } from "node:crypto";
import { HttpError } from "../../middleware/error.js";
import type { FifoAllocation } from "../inventory/inventory.service.js";
import { calculateExternalOrderLine } from "./external-order-line.js";
import type { OrdersRepository } from "./orders.repository.js";
import type { OrderInput, OrderLineInput } from "./orders.schemas.js";

const formatScaled = (value: bigint, scale: number) => {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const divisor = 10n ** BigInt(scale);
  return `${negative ? "-" : ""}${absolute / divisor}.${(absolute % divisor)
    .toString()
    .padStart(scale, "0")}`;
};

const stringToScaled = (value: string, scale: number) => {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const result =
    BigInt(whole || "0") * 10n ** BigInt(scale) +
    BigInt(fraction.padEnd(scale, "0").slice(0, scale) || "0");
  return negative ? -result : result;
};

const numberToScaled = (value: number, scale: number) =>
  BigInt(value.toFixed(scale).replace(".", ""));

const roundDivide = (numerator: bigint, denominator: bigint) =>
  (numerator + denominator / 2n) / denominator;

const isDuplicateEntry = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "ER_DUP_ENTRY";

function normalizeLines(lines: OrderLineInput[]) {
  const combined = new Map<string, OrderLineInput>();
  for (const line of lines) {
    const modifiers = [...line.modifiers].sort(
      (left, right) =>
        left.externalModifierOptionId - right.externalModifierOptionId,
    );
    const key = JSON.stringify({
      product: line.externalProductId,
      size: line.externalSizeId,
      modifiers,
    });
    const existing = combined.get(key);
    if (existing) existing.quantity += line.quantity;
    else combined.set(key, { ...line, modifiers });
  }
  return [...combined.values()];
}

function orderNumber(now: Date) {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `POS-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function requestFingerprint(data: OrderInput) {
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

  async create(data: OrderInput, cashierId: number) {
    let orderId: number;
    const fingerprint = requestFingerprint(data);
    try {
      orderId = await this.repo.transaction(async (repo, inventory) => {
        const existing = await repo.findByClientRequestId(data.clientRequestId);
        if (existing) {
          this.assertReplay(existing, fingerprint, cashierId);
          return existing.id;
        }

        const shift = await repo.findOpenShiftForCashier(cashierId);
        if (!shift) {
          throw new HttpError(409, "يجب فتح وردية قبل تسجيل البيع");
        }
        const normalized = normalizeLines(data.lines);
        if (normalized.some((line) => line.quantity > 999)) {
          throw new HttpError(400, "كمية المنتج خارج النطاق المسموح");
        }
        const products = await repo.loadExternalProducts(
          normalized.map((line) => line.externalProductId),
        );
        const productsById = new Map(
          products.map((product) => [product.externalId, product]),
        );
        const now = new Date();
        const calculated = normalized.map((line) => {
          const product = productsById.get(line.externalProductId);
          if (!product) {
            throw new HttpError(404, "المنتج الخارجي غير موجود");
          }
          return calculateExternalOrderLine(product, line, now.getTime());
        });

        const stockItemIds = calculated.flatMap((line) =>
          line.consumptions.map((consumption) => consumption.itemId),
        );
        const stockRows = await repo.lockStockItems(stockItemIds);
        if (stockRows.length !== new Set(stockItemIds).size) {
          throw new HttpError(409, "أحد أصناف المخزون غير موجود");
        }
        if (stockRows.some((row) => !row.isActive)) {
          throw new HttpError(409, "أحد أصناف المخزون موقوف");
        }

        const subtotal = calculated.reduce(
          (sum, line) => sum + stringToScaled(line.lineSubtotal, 2),
          0n,
        );
        if (subtotal > 999_999_999_999n) {
          throw new HttpError(400, "إجمالي الطلب خارج النطاق المسموح");
        }
        let discountValue: bigint | null = null;
        let discountAmount = 0n;
        if (data.discount) {
          discountValue = numberToScaled(data.discount.value, 2);
          discountAmount =
            data.discount.type === "percent"
              ? roundDivide(subtotal * discountValue, 10_000n)
              : discountValue;
          if (discountAmount > subtotal) {
            throw new HttpError(400, "الخصم الثابت أكبر من إجمالي الطلب");
          }
        }
        const total = subtotal - discountAmount;
        const cashReceived = numberToScaled(data.cashReceived, 2);
        if (cashReceived < total) {
          throw new HttpError(400, "المبلغ المستلم أقل من إجمالي الطلب");
        }

        const id = await repo.createOrder({
          orderNumber: orderNumber(now),
          clientRequestId: data.clientRequestId,
          requestFingerprint: fingerprint,
          cashierId,
          shiftId: shift.id,
          subtotal: formatScaled(subtotal, 2),
          discountType: data.discount?.type ?? null,
          discountValue:
            discountValue === null ? null : formatScaled(discountValue, 2),
          discountAmount: formatScaled(discountAmount, 2),
          total: formatScaled(total, 2),
          cashReceived: formatScaled(cashReceived, 2),
          changeAmount: formatScaled(cashReceived - total, 2),
          totalCost: "0.00",
          isNegativeStock: false,
          createdAt: now,
        });

        let roundedOrderCost = 0n;
        let orderHasDeficit = false;
        for (const line of calculated) {
          const lineId = await repo.createLine({
            orderId: id,
            type: "external_product",
            recipeId: null,
            recipeSizeId: null,
            itemId: null,
            externalProductId: line.externalProductId,
            externalSizeId: line.externalSizeId,
            productName: line.productName,
            sizeName: line.sizeName,
            quantity: line.quantityText,
            unitPrice: line.unitPrice,
            lineSubtotal: line.lineSubtotal,
            totalCost: "0.00",
            hasStockDeficit: false,
          });
          for (const modifier of line.modifiers) {
            await repo.createLineModifier({ orderLineId: lineId, ...modifier });
          }

          let lineCostAtScaleNine = 0n;
          let lineHasDeficit = false;
          for (const consumption of line.consumptions) {
            if (consumption.quantity === "0.000") {
              throw new HttpError(
                400,
                "كمية أحد مكونات المنتج أصغر من دقة المخزون",
              );
            }
            const consumed = await inventory.consume({
              itemId: consumption.itemId,
              warehouse: "cafe",
              quantity: Number(consumption.quantity),
              movementType: "sale",
              referenceType: "order",
              referenceId: id,
              notes: null,
              occurredAt: now,
              allowNegative: true,
            });
            for (const allocation of consumed.allocations) {
              await this.saveAllocation(
                repo,
                lineId,
                consumption.itemId,
                consumption.itemName,
                allocation,
              );
              lineCostAtScaleNine +=
                stringToScaled(allocation.quantity, 3) *
                stringToScaled(allocation.unitCost, 6);
              if (allocation.batchId === null) lineHasDeficit = true;
            }
          }
          const roundedLineCost = roundDivide(lineCostAtScaleNine, 10_000_000n);
          await repo.updateLine(lineId, {
            totalCost: formatScaled(roundedLineCost, 2),
            hasStockDeficit: lineHasDeficit,
          });
          roundedOrderCost += roundedLineCost;
          orderHasDeficit ||= lineHasDeficit;
        }
        await repo.updateOrder(id, {
          totalCost: formatScaled(roundedOrderCost, 2),
          isNegativeStock: orderHasDeficit,
        });
        return id;
      });
    } catch (error) {
      if (!isDuplicateEntry(error)) throw error;
      const existing = await this.repo.findByClientRequestId(
        data.clientRequestId,
      );
      if (!existing) throw error;
      this.assertReplay(existing, fingerprint, cashierId);
      orderId = existing.id;
    }
    return this.get(orderId);
  }

  private assertReplay(
    existing: { cashierId: number; requestFingerprint: string },
    fingerprint: string,
    cashierId: number,
  ) {
    if (existing.requestFingerprint !== fingerprint) {
      throw new HttpError(409, "معرّف الطلب مستخدم لبيانات بيع مختلفة");
    }
    if (existing.cashierId !== cashierId) {
      throw new HttpError(409, "معرّف الطلب مستخدم من مستخدم آخر");
    }
  }

  private saveAllocation(
    repo: OrdersRepository,
    orderLineId: number,
    itemId: number,
    itemName: string,
    allocation: FifoAllocation,
  ) {
    return repo.createAllocation({
      orderLineId,
      itemId,
      itemName,
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
    const [allocations, modifiers] = await Promise.all([
      this.repo.listAllocations(lines.map((line) => line.id)),
      this.repo.listModifiers(lines.map((line) => line.id)),
    ]);
    return {
      ...order,
      lines: lines.map((line) => ({
        ...line,
        allocations: allocations
          .filter((allocation) => allocation.orderLineId === line.id)
          .map(({ orderLineId: _orderLineId, ...allocation }) => allocation),
        modifiers: modifiers
          .filter((modifier) => modifier.orderLineId === line.id)
          .map(({ orderLineId: _orderLineId, ...modifier }) => modifier),
      })),
    };
  }
}
