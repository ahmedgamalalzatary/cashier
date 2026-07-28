import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import type { Db } from "../../db/index.js";
import {
  categories,
  categoryColors,
  categorySizes,
  items,
  orderLineAllocations,
  orderLines,
  orders,
  products,
  shifts,
  users,
} from "../../db/schema.js";
import { InventoryRepository } from "../inventory/inventory.repository.js";
import { InventoryTransaction } from "../inventory/inventory.service.js";

const parentCategory = alias(categories, "order_parent_category");

export class OrdersRepository {
  constructor(private db: Db) {}

  transaction<T>(
    fn: (repo: OrdersRepository, inventory: InventoryTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction((tx) => {
      const transactionDb = tx as unknown as Db;
      return fn(
        new OrdersRepository(transactionDb),
        new InventoryTransaction(new InventoryRepository(transactionDb)),
      );
    });
  }

  listCatalogItems() {
    return this.db
      .select({
        variantId: items.id,
        code: items.code,
        barcode: items.barcode,
        productId: products.id,
        productName: products.name,
        colorId: categoryColors.id,
        colorName: categoryColors.name,
        sizeId: categorySizes.id,
        sizeName: categorySizes.name,
        categoryId: categories.id,
        categoryName: categories.name,
        parentCategoryId: categories.parentId,
        parentCategoryName: parentCategory.name,
        sellingPrice: items.sellingPrice,
      })
      .from(items)
      .innerJoin(products, eq(items.productId, products.id))
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .innerJoin(categoryColors, eq(items.colorId, categoryColors.id))
      .innerJoin(categorySizes, eq(items.sizeId, categorySizes.id))
      .leftJoin(parentCategory, eq(categories.parentId, parentCategory.id))
      .where(
        and(
          eq(items.isActive, true),
          eq(products.isActive, true),
          eq(categories.isActive, true),
          or(isNull(categories.parentId), eq(parentCategory.isActive, true)),
        ),
      )
      .orderBy(products.name, categoryColors.name, categorySizes.name);
  }

  lockItems(ids: number[]) {
    if (!ids.length) return Promise.resolve([]);
    return this.db
      .select({
        id: items.id,
        code: items.code,
        barcode: items.barcode,
        sellingPrice: items.sellingPrice,
        isActive: items.isActive,
        productName: products.name,
        productIsActive: products.isActive,
        colorName: categoryColors.name,
        sizeName: categorySizes.name,
      })
      .from(items)
      .innerJoin(products, eq(items.productId, products.id))
      .innerJoin(categoryColors, eq(items.colorId, categoryColors.id))
      .innerJoin(categorySizes, eq(items.sizeId, categorySizes.id))
      .where(inArray(items.id, [...new Set(ids)].sort((a, b) => a - b)))
      .orderBy(items.id)
      .for("update");
  }

  async createOrder(data: typeof orders.$inferInsert) {
    const [result] = await this.db.insert(orders).values(data);
    return result.insertId;
  }
  async findOpenShiftForCashier(cashierUserId: number) {
    const [row] = await this.db
      .select({ id: shifts.id })
      .from(shifts)
      .where(
        and(eq(shifts.openSlot, 1), eq(shifts.cashierUserId, cashierUserId)),
      )
      .for("update");
    return row;
  }
  async findByClientRequestId(clientRequestId: string) {
    const [row] = await this.db
      .select({
        id: orders.id,
        cashierId: orders.cashierId,
        requestFingerprint: orders.requestFingerprint,
      })
      .from(orders)
      .where(eq(orders.clientRequestId, clientRequestId));
    return row;
  }
  async createLine(data: typeof orderLines.$inferInsert) {
    const [result] = await this.db.insert(orderLines).values(data);
    return result.insertId;
  }
  async updateLine(
    id: number,
    data: Pick<typeof orderLines.$inferInsert, "totalCost" | "hasStockDeficit">,
  ) {
    await this.db.update(orderLines).set(data).where(eq(orderLines.id, id));
  }
  async updateOrder(
    id: number,
    data: Pick<typeof orders.$inferInsert, "totalCost" | "isNegativeStock">,
  ) {
    await this.db.update(orders).set(data).where(eq(orders.id, id));
  }
  async createAllocation(data: typeof orderLineAllocations.$inferInsert) {
    await this.db.insert(orderLineAllocations).values(data);
  }

  listRecent(limit = 50) {
    return this.db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        cashierId: orders.cashierId,
        cashierName: users.name,
        shiftId: orders.shiftId,
        subtotal: orders.subtotal,
        discountType: orders.discountType,
        discountValue: orders.discountValue,
        discountAmount: orders.discountAmount,
        total: orders.total,
        cashReceived: orders.cashReceived,
        changeAmount: orders.changeAmount,
        totalCost: orders.totalCost,
        isNegativeStock: orders.isNegativeStock,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .innerJoin(users, eq(orders.cashierId, users.id))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(limit);
  }
  async findOrder(id: number) {
    const [row] = await this.db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        cashierId: orders.cashierId,
        cashierName: users.name,
        shiftId: orders.shiftId,
        subtotal: orders.subtotal,
        discountType: orders.discountType,
        discountValue: orders.discountValue,
        discountAmount: orders.discountAmount,
        total: orders.total,
        cashReceived: orders.cashReceived,
        changeAmount: orders.changeAmount,
        totalCost: orders.totalCost,
        isNegativeStock: orders.isNegativeStock,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .innerJoin(users, eq(orders.cashierId, users.id))
      .where(eq(orders.id, id));
    return row;
  }
  listLines(orderId: number) {
    return this.db
      .select()
      .from(orderLines)
      .where(eq(orderLines.orderId, orderId))
      .orderBy(asc(orderLines.id));
  }
  listAllocations(orderLineIds: number[]) {
    if (!orderLineIds.length) return Promise.resolve([]);
    return this.db
      .select({
        id: orderLineAllocations.id,
        orderLineId: orderLineAllocations.orderLineId,
        variantId: orderLineAllocations.itemId,
        variantCode: items.code,
        variantName: orderLineAllocations.itemName,
        batchId: orderLineAllocations.batchId,
        stockMovementId: orderLineAllocations.stockMovementId,
        quantity: orderLineAllocations.quantity,
        unitCost: orderLineAllocations.unitCost,
        lineCost: sql<string>`CAST(
          ${orderLineAllocations.quantity} * ${orderLineAllocations.unitCost}
          AS DECIMAL(30,2)
        )`,
      })
      .from(orderLineAllocations)
      .innerJoin(items, eq(orderLineAllocations.itemId, items.id))
      .where(inArray(orderLineAllocations.orderLineId, orderLineIds))
      .orderBy(orderLineAllocations.id);
  }
}
