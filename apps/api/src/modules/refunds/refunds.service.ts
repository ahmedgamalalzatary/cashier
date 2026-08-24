import { createHash } from "node:crypto";
import { HttpError } from "../../middleware/error.js";
import type { RefundsRepository } from "./refunds.repository.js";
import type { RefundInput } from "./refunds.schemas.js";

const scaled = (value: string | number, scale: number) => {
  const text = typeof value === "number" ? value.toFixed(scale) : value;
  const negative = text.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? text.slice(1) : text).split(
    ".",
  );
  const result =
    BigInt(whole || "0") * 10n ** BigInt(scale) +
    BigInt(fraction.padEnd(scale, "0").slice(0, scale) || "0");
  return negative ? -result : result;
};

const format = (value: bigint, scale: number) => {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const divisor = 10n ** BigInt(scale);
  return `${negative ? "-" : ""}${absolute / divisor}.${(absolute % divisor)
    .toString()
    .padStart(scale, "0")}`;
};

const roundDivide = (numerator: bigint, denominator: bigint) =>
  (numerator + denominator / 2n) / denominator;

const fingerprint = (input: RefundInput) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        orderId: input.orderId,
        reason: input.reason,
        lines: [...input.lines].sort(
          (left, right) => left.orderLineId - right.orderLineId,
        ),
      }),
    )
    .digest("hex");

const isDuplicateEntry = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "ER_DUP_ENTRY";

export class RefundsService {
  constructor(private repo: RefundsRepository) {}

  list() {
    return this.repo.list();
  }

  async quantities(orderId: number) {
    const order = await this.repo.findOrder(orderId);
    if (!order) throw new HttpError(404, "الطلب الأصلي غير موجود");
    return this.repo.refundedQuantitiesForOrder(orderId);
  }

  async get(id: number) {
    const refund = await this.repo.find(id);
    if (!refund) throw new HttpError(404, "المرتجع غير موجود");
    return { ...refund, lines: await this.repo.listLines(id) };
  }

  async create(input: RefundInput, cashierId: number) {
    const requestFingerprint = fingerprint(input);
    let refundId: number;
    try {
      refundId = await this.repo.transaction(async (repo, inventory) => {
        const replay = await repo.findByClientRequestId(input.clientRequestId);
        if (replay) {
          this.assertReplay(replay, requestFingerprint, cashierId);
          return replay.id;
        }
        const shift = await repo.findOpenShiftForCashier(cashierId);
        if (!shift) throw new HttpError(409, "يجب فتح وردية قبل تسجيل المرتجع");
        const order = await repo.lockOrder(input.orderId);
        if (!order) throw new HttpError(404, "الطلب الأصلي غير موجود");

        const lineIds = input.lines.map((line) => line.orderLineId);
        const orderLines = await repo.lockOrderLines(input.orderId, lineIds);
        if (orderLines.length !== lineIds.length) {
          throw new HttpError(400, "أحد البنود لا ينتمي إلى الطلب الأصلي");
        }
        const existingRows = await repo.refundedQuantities(lineIds);
        const existing = new Map(
          existingRows.map((row) => [row.orderLineId, scaled(row.quantity, 3)]),
        );
        const existingGross = new Map(
          existingRows.map((row) => [
            row.orderLineId,
            scaled(row.grossAmount, 2),
          ]),
        );
        const linesById = new Map(orderLines.map((line) => [line.id, line]));
        const subtotal = scaled(order.subtotal, 2);
        const orderTotal = scaled(order.total, 2);
        const priorFinancials = await repo.financialTotals(order.id);
        let runningGross = scaled(priorFinancials.gross, 2);
        const priorRefunded = scaled(priorFinancials.refunded, 2);
        let refundAmount = 0n;
        const calculated = input.lines
          .map((requested) => {
            const line = linesById.get(requested.orderLineId)!;
            const requestedQuantity = scaled(requested.quantity, 3);
            const soldQuantity = scaled(line.quantity, 3);
            if (
              (existing.get(line.id) ?? 0n) + requestedQuantity >
              soldQuantity
            ) {
              throw new HttpError(
                409,
                `الكمية المرتجعة من ${line.productName} تتجاوز الكمية المباعة`,
              );
            }
            if (line.type === "recipe" && requestedQuantity % 1_000n !== 0n) {
              throw new HttpError(
                400,
                "كمية منتج الوصفة المرتجعة يجب أن تكون عدداً صحيحاً",
              );
            }
            if (line.type === "item" && requested.stockAction === null) {
              throw new HttpError(400, `اختر معالجة مخزون ${line.productName}`);
            }
            if (line.type === "recipe" && requested.stockAction !== null) {
              throw new HttpError(
                400,
                "منتجات الوصفات لا تعاد مكوناتها إلى المخزون",
              );
            }
            const priorQuantity = existing.get(line.id) ?? 0n;
            const priorGross = existingGross.get(line.id) ?? 0n;
            const remainingGross = scaled(line.lineSubtotal, 2) - priorGross;
            const gross =
              priorQuantity + requestedQuantity === soldQuantity
                ? remainingGross
                : (() => {
                    const proportional = roundDivide(
                      scaled(line.lineSubtotal, 2) * requestedQuantity,
                      soldQuantity,
                    );
                    return proportional < remainingGross
                      ? proportional
                      : remainingGross;
                  })();
            return { requested, line, requestedQuantity, gross, cash: 0n };
          })
          .sort((left, right) => left.line.id - right.line.id);

        for (const entry of calculated) {
          const before =
            subtotal === 0n
              ? 0n
              : roundDivide(runningGross * orderTotal, subtotal);
          runningGross += entry.gross;
          const after =
            subtotal === 0n
              ? 0n
              : roundDivide(runningGross * orderTotal, subtotal);
          entry.cash = after - before;
          refundAmount += entry.cash;
        }
        const remainingCash = orderTotal - priorRefunded;
        if (refundAmount > remainingCash) {
          throw new HttpError(
            409,
            "قيمة المرتجع تتجاوز الرصيد النقدي المتبقي للطلب",
          );
        }
        if (refundAmount <= 0n) {
          throw new HttpError(409, "قيمة المرتجع تساوي صفراً");
        }

        const occurredAt = new Date();
        const id = await repo.createRefund({
          clientRequestId: input.clientRequestId,
          requestFingerprint,
          orderId: order.id,
          shiftId: shift.id,
          cashierId,
          reason: input.reason,
          amount: format(refundAmount, 2),
          totalCostReturned: "0.00",
          createdAt: occurredAt,
        });

        let totalCostReturned = 0n;
        for (const entry of calculated) {
          const allocations =
            entry.line.type === "item"
              ? await repo.allocations(entry.line.id)
              : [];
          const priorReturns = new Map(
            (
              await repo.returnedAllocationQuantities(
                allocations.map((allocation) => allocation.id),
              )
            ).map((row) => [
              row.orderLineAllocationId,
              scaled(row.quantity, 3),
            ]),
          );
          let lineCostScaleNine = 0n;
          let remainingToAllocate = entry.requestedQuantity;
          const plannedReturns: Array<{
            allocation: (typeof allocations)[number];
            quantity: bigint;
          }> = [];
          for (const allocation of allocations) {
            if (remainingToAllocate === 0n) break;
            const available =
              scaled(allocation.quantity, 3) -
              (priorReturns.get(allocation.id) ?? 0n);
            const quantity =
              available < remainingToAllocate ? available : remainingToAllocate;
            if (quantity > 0n) {
              plannedReturns.push({ allocation, quantity });
              lineCostScaleNine += quantity * scaled(allocation.unitCost, 6);
              remainingToAllocate -= quantity;
            }
          }
          if (entry.line.type === "item" && remainingToAllocate !== 0n) {
            throw new HttpError(
              409,
              "تعذر مطابقة كمية المرتجع مع تكلفة البيع الأصلية",
            );
          }
          const returnedCost = roundDivide(lineCostScaleNine, 10_000_000n);
          const storedReturnedCost =
            entry.requested.stockAction === "return_to_stock"
              ? returnedCost
              : 0n;
          const refundLineId = await repo.createLine({
            refundId: id,
            orderLineId: entry.line.id,
            type: entry.line.type,
            productName: entry.line.productName,
            sizeName: entry.line.sizeName,
            quantity: format(entry.requestedQuantity, 3),
            unitPrice: entry.line.unitPrice,
            grossAmount: format(entry.gross, 2),
            refundAmount: format(entry.cash, 2),
            stockAction: entry.requested.stockAction,
            returnedCost: format(storedReturnedCost, 2),
          });

          if (entry.line.type === "item") {
            if (entry.requested.stockAction === "return_to_stock") {
              for (const planned of plannedReturns) {
                const received = await inventory.receive({
                  itemId: planned.allocation.itemId,
                  warehouse: "cafe",
                  quantity: Number(format(planned.quantity, 3)),
                  unitCost: planned.allocation.unitCost,
                  movementType: "refund_return",
                  referenceType: "refund",
                  referenceId: id,
                  notes: input.reason,
                  occurredAt,
                });
                await repo.createReturnAllocation({
                  refundLineId,
                  orderLineAllocationId: planned.allocation.id,
                  itemId: planned.allocation.itemId,
                  quantity: format(planned.quantity, 3),
                  unitCost: planned.allocation.unitCost,
                  returnedBatchId: received.batchId,
                });
              }
              totalCostReturned += storedReturnedCost;
            } else {
              for (const planned of plannedReturns) {
                await repo.createReturnAllocation({
                  refundLineId,
                  orderLineAllocationId: planned.allocation.id,
                  itemId: planned.allocation.itemId,
                  quantity: format(planned.quantity, 3),
                  unitCost: planned.allocation.unitCost,
                  returnedBatchId: null,
                });
              }
              await repo.createWaste({
                shiftId: shift.id,
                warehouse: "cafe",
                targetType: "item",
                itemId: entry.line.itemId!,
                targetName: entry.line.productName,
                quantity: format(entry.requestedQuantity, 3),
                reason: input.reason,
                reasonCode: "other",
                note: input.reason,
                totalCost: format(returnedCost, 2),
                recordedBy: cashierId,
                refundLineId,
                occurredAt,
              });
            }
          }
        }
        await repo.updateTotalCost(
          id,
          format(totalCostReturned, 2),
        );
        return id;
      });
    } catch (error) {
      if (!isDuplicateEntry(error)) throw error;
      const replay = await this.repo.findByClientRequestId(
        input.clientRequestId,
      );
      if (!replay) throw error;
      this.assertReplay(replay, requestFingerprint, cashierId);
      refundId = replay.id;
    }
    return this.get(refundId);
  }

  private assertReplay(
    replay: { cashierId: number; requestFingerprint: string },
    requestFingerprint: string,
    cashierId: number,
  ) {
    if (
      replay.cashierId !== cashierId ||
      replay.requestFingerprint !== requestFingerprint
    ) {
      throw new HttpError(409, "معرّف طلب المرتجع مستخدم لبيانات مختلفة");
    }
  }
}
