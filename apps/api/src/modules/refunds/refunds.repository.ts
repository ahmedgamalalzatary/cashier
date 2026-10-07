import {
  branchCondition,
  branchValues,
  branchTransaction,
} from "@cashier/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@cashier/db";
import {
  items,
  orderLineAllocations,
  orderLines,
  orders,
  refundLines,
  refundLineAllocations,
  refunds,
  shifts,
  users,
  wasteEntries,
} from "@cashier/db";
import { InventoryRepository } from "../inventory/inventory.repository.js";
import { InventoryTransaction } from "../inventory/inventory.service.js";

export class RefundsRepository {
  constructor(private db: Db) {}

  transaction<T>(
    fn: (
      repo: RefundsRepository,
      inventory: InventoryTransaction,
    ) => Promise<T>,
  ): Promise<T> {
    return branchTransaction(this.db, (tx) => {
      const transactionDb = tx as unknown as Db;
      return fn(
        new RefundsRepository(transactionDb),
        new InventoryTransaction(new InventoryRepository(transactionDb)),
      );
    });
  }

  async findOpenShiftForCashier(cashierId: number) {
    const [row] = await this.db
      .select({ id: shifts.id })
      .from(shifts)
      .where(
        branchCondition(
          shifts,
          and(eq(shifts.openSlot, 1), eq(shifts.cashierUserId, cashierId)),
        ),
      )
      .for("update");
    return row;
  }

  async lockOrder(id: number) {
    const [row] = await this.db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        subtotal: orders.subtotal,
        discountAmount: orders.discountAmount,
        total: orders.total,
      })
      .from(orders)
      .where(branchCondition(orders, eq(orders.id, id)))
      .for("update");
    return row;
  }

  async findOrder(id: number) {
    const [row] = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(branchCondition(orders, eq(orders.id, id)));
    return row;
  }

  lockOrderLines(orderId: number, lineIds: number[]) {
    if (lineIds.length === 0) return Promise.resolve([]);
    return this.db
      .select({
        id: orderLines.id,
        orderId: orderLines.orderId,
        type: orderLines.type,
        itemId: orderLines.itemId,
        externalProductId: orderLines.externalProductId,
        externalSizeId: orderLines.externalSizeId,
        productName: orderLines.productName,
        sizeName: orderLines.sizeName,
        quantity: orderLines.quantity,
        unitPrice: orderLines.unitPrice,
        lineSubtotal: orderLines.lineSubtotal,
      })
      .from(orderLines)
      .where(
        branchCondition(
          orderLines,
          and(
            eq(orderLines.orderId, orderId),
            inArray(
              orderLines.id,
              [...lineIds].sort((a, b) => a - b),
            ),
          ),
        ),
      )
      .orderBy(asc(orderLines.id))
      .for("update");
  }

  refundedQuantities(lineIds: number[]) {
    if (lineIds.length === 0) return Promise.resolve([]);
    return this.db
      .select({
        orderLineId: refundLines.orderLineId,
        quantity: sql<string>`CAST(SUM(${refundLines.quantity}) AS DECIMAL(14,3))`,
        grossAmount: sql<string>`CAST(SUM(${refundLines.grossAmount}) AS DECIMAL(12,2))`,
      })
      .from(refundLines)
      .where(
        branchCondition(refundLines, inArray(refundLines.orderLineId, lineIds)),
      )
      .groupBy(refundLines.orderLineId)
      .for("update");
  }

  refundedQuantitiesForOrder(orderId: number) {
    return this.db
      .select({
        orderLineId: refundLines.orderLineId,
        refundedQuantity: sql<string>`CAST(SUM(${refundLines.quantity}) AS DECIMAL(14,3))`,
      })
      .from(refundLines)
      .innerJoin(
        orderLines,
        branchCondition(orderLines, eq(refundLines.orderLineId, orderLines.id)),
      )
      .where(branchCondition(refundLines, eq(orderLines.orderId, orderId)))
      .groupBy(refundLines.orderLineId)
      .orderBy(asc(refundLines.orderLineId));
  }

  async financialTotals(orderId: number) {
    const [row] = await this.db
      .select({
        gross: sql<string>`CAST(COALESCE(SUM(${refundLines.grossAmount}), 0) AS DECIMAL(12,2))`,
        refunded: sql<string>`CAST(COALESCE(SUM(${refundLines.refundAmount}), 0) AS DECIMAL(12,2))`,
      })
      .from(refundLines)
      .innerJoin(
        refunds,
        branchCondition(refunds, eq(refundLines.refundId, refunds.id)),
      )
      .where(branchCondition(refundLines, eq(refunds.orderId, orderId)));
    return row;
  }

  async findByClientRequestId(clientRequestId: string) {
    const [row] = await this.db
      .select({
        id: refunds.id,
        cashierId: refunds.cashierId,
        requestFingerprint: refunds.requestFingerprint,
      })
      .from(refunds)
      .where(
        branchCondition(refunds, eq(refunds.clientRequestId, clientRequestId)),
      );
    return row;
  }

  allocations(orderLineId: number) {
    return this.db
      .select({
        id: orderLineAllocations.id,
        itemId: orderLineAllocations.itemId,
        itemName: orderLineAllocations.itemName,
        quantity: orderLineAllocations.quantity,
        unitCost: orderLineAllocations.unitCost,
      })
      .from(orderLineAllocations)
      .where(
        branchCondition(
          orderLineAllocations,
          eq(orderLineAllocations.orderLineId, orderLineId),
        ),
      )
      .orderBy(asc(orderLineAllocations.id));
  }

  returnedAllocationQuantities(orderLineAllocationIds: number[]) {
    if (orderLineAllocationIds.length === 0) return Promise.resolve([]);
    return this.db
      .select({
        orderLineAllocationId: refundLineAllocations.orderLineAllocationId,
        quantity: sql<string>`CAST(SUM(${refundLineAllocations.quantity}) AS DECIMAL(14,3))`,
      })
      .from(refundLineAllocations)
      .where(
        branchCondition(
          refundLineAllocations,
          inArray(
            refundLineAllocations.orderLineAllocationId,
            orderLineAllocationIds,
          ),
        ),
      )
      .groupBy(refundLineAllocations.orderLineAllocationId);
  }

  async createRefund(data: typeof refunds.$inferInsert) {
    const [result] = await this.db.insert(refunds).values(branchValues(data));
    return result.insertId;
  }

  async createLine(data: typeof refundLines.$inferInsert) {
    const [result] = await this.db
      .insert(refundLines)
      .values(branchValues(data));
    return result.insertId;
  }

  createReturnAllocation(data: typeof refundLineAllocations.$inferInsert) {
    return this.db.insert(refundLineAllocations).values(branchValues(data));
  }

  createWaste(data: typeof wasteEntries.$inferInsert) {
    return this.db.insert(wasteEntries).values(branchValues(data));
  }

  updateTotalCost(id: number, totalCostReturned: string) {
    return this.db
      .update(refunds)
      .set({ totalCostReturned })
      .where(branchCondition(refunds, eq(refunds.id, id)));
  }

  list(limit = 100) {
    return this.db
      .select({
        id: refunds.id,
        orderId: refunds.orderId,
        orderNumber: orders.orderNumber,
        shiftId: refunds.shiftId,
        cashierId: refunds.cashierId,
        cashierName: users.name,
        reason: refunds.reason,
        amount: refunds.amount,
        totalCostReturned: refunds.totalCostReturned,
        isAdminRefund: refunds.isAdminRefund,
        createdAt: refunds.createdAt,
      })
      .from(refunds)
      .innerJoin(
        orders,
        branchCondition(orders, eq(refunds.orderId, orders.id)),
      )
      .innerJoin(users, eq(refunds.cashierId, users.id))
      .where(branchCondition(refunds))
      .orderBy(desc(refunds.createdAt), desc(refunds.id))
      .limit(limit);
  }

  async find(id: number) {
    const [row] = await this.db
      .select({
        id: refunds.id,
        orderId: refunds.orderId,
        orderNumber: orders.orderNumber,
        shiftId: refunds.shiftId,
        cashierId: refunds.cashierId,
        cashierName: users.name,
        reason: refunds.reason,
        amount: refunds.amount,
        totalCostReturned: refunds.totalCostReturned,
        isAdminRefund: refunds.isAdminRefund,
        createdAt: refunds.createdAt,
      })
      .from(refunds)
      .innerJoin(
        orders,
        branchCondition(orders, eq(refunds.orderId, orders.id)),
      )
      .innerJoin(users, eq(refunds.cashierId, users.id))
      .where(branchCondition(refunds, eq(refunds.id, id)));
    return row;
  }

  listLines(refundId: number) {
    return (
      this.db
        .select({
          id: refundLines.id,
          orderLineId: refundLines.orderLineId,
          type: refundLines.type,
          productName: refundLines.productName,
          sizeName: refundLines.sizeName,
          quantity: refundLines.quantity,
          unitPrice: refundLines.unitPrice,
          grossAmount: refundLines.grossAmount,
          refundAmount: refundLines.refundAmount,
          stockAction: refundLines.stockAction,
          returnedCost: refundLines.returnedCost,
          itemCode: items.code,
        })
        .from(refundLines)
        // order_lines.item_id references one items.id row. Keep that 1:1
        // relationship if the schema changes so this join cannot multiply lines.
        .leftJoin(
          orderLines,
          branchCondition(
            orderLines,
            eq(refundLines.orderLineId, orderLines.id),
          ),
        )
        .leftJoin(
          items,
          branchCondition(items, eq(orderLines.itemId, items.id)),
        )
        .where(branchCondition(refundLines, eq(refundLines.refundId, refundId)))
        .orderBy(asc(refundLines.id))
    );
  }
}
