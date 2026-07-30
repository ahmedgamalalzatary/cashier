import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
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
} from "../../db/schema.js";
import { InventoryRepository } from "../inventory/inventory.repository.js";
import { InventoryTransaction } from "../inventory/inventory.service.js";

export class RefundsRepository {
  constructor(private db: Db) {}

  transaction<T>(
    fn: (repo: RefundsRepository, inventory: InventoryTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction((tx) => {
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
      .where(and(eq(shifts.openSlot, 1), eq(shifts.cashierUserId, cashierId)))
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
      .where(eq(orders.id, id))
      .for("update");
    return row;
  }

  async findOrder(id: number) {
    const [row] = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.id, id));
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
        productName: orderLines.productName,
        sizeName: orderLines.sizeName,
        quantity: orderLines.quantity,
        unitPrice: orderLines.unitPrice,
        lineSubtotal: orderLines.lineSubtotal,
      })
      .from(orderLines)
      .where(
        and(
          eq(orderLines.orderId, orderId),
          inArray(orderLines.id, [...lineIds].sort((a, b) => a - b)),
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
      .where(inArray(refundLines.orderLineId, lineIds))
      .groupBy(refundLines.orderLineId);
  }

  refundedQuantitiesForOrder(orderId: number) {
    return this.db
      .select({
        orderLineId: refundLines.orderLineId,
        refundedQuantity: sql<string>`CAST(SUM(${refundLines.quantity}) AS DECIMAL(14,3))`,
      })
      .from(refundLines)
      .innerJoin(orderLines, eq(refundLines.orderLineId, orderLines.id))
      .where(eq(orderLines.orderId, orderId))
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
      .innerJoin(refunds, eq(refundLines.refundId, refunds.id))
      .where(eq(refunds.orderId, orderId));
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
      .where(eq(refunds.clientRequestId, clientRequestId));
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
      .where(eq(orderLineAllocations.orderLineId, orderLineId))
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
        inArray(
          refundLineAllocations.orderLineAllocationId,
          orderLineAllocationIds,
        ),
      )
      .groupBy(refundLineAllocations.orderLineAllocationId);
  }

  async createRefund(data: typeof refunds.$inferInsert) {
    const [result] = await this.db.insert(refunds).values(data);
    return result.insertId;
  }

  async createLine(data: typeof refundLines.$inferInsert) {
    const [result] = await this.db.insert(refundLines).values(data);
    return result.insertId;
  }

  createReturnAllocation(data: typeof refundLineAllocations.$inferInsert) {
    return this.db.insert(refundLineAllocations).values(data);
  }

  createWaste(data: typeof wasteEntries.$inferInsert) {
    return this.db.insert(wasteEntries).values(data);
  }

  updateTotalCost(id: number, totalCostReturned: string) {
    return this.db
      .update(refunds)
      .set({ totalCostReturned })
      .where(eq(refunds.id, id));
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
        createdAt: refunds.createdAt,
      })
      .from(refunds)
      .innerJoin(orders, eq(refunds.orderId, orders.id))
      .innerJoin(users, eq(refunds.cashierId, users.id))
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
        createdAt: refunds.createdAt,
      })
      .from(refunds)
      .innerJoin(orders, eq(refunds.orderId, orders.id))
      .innerJoin(users, eq(refunds.cashierId, users.id))
      .where(eq(refunds.id, id));
    return row;
  }

  listLines(refundId: number) {
    return this.db
      .select({
        id: refundLines.id,
        orderLineId: refundLines.orderLineId,
        type: refundLines.type,
        productName: refundLines.productName,
        sizeName: refundLines.sizeName,
        quantity: refundLines.quantity,
        unitPrice: refundLines.unitPrice,
        refundAmount: refundLines.refundAmount,
        stockAction: refundLines.stockAction,
        returnedCost: refundLines.returnedCost,
        itemCode: items.code,
      })
      .from(refundLines)
      // order_lines.item_id references one items.id row. Keep that 1:1
      // relationship if the schema changes so this join cannot multiply lines.
      .leftJoin(orderLines, eq(refundLines.orderLineId, orderLines.id))
      .leftJoin(items, eq(orderLines.itemId, items.id))
      .where(eq(refundLines.refundId, refundId))
      .orderBy(asc(refundLines.id));
  }
}
