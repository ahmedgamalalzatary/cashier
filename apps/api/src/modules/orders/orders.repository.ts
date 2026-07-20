import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import type { Db } from "../../db/index.js";
import {
  categories,
  items,
  orderLineAllocations,
  orderLines,
  orders,
  recipeIngredients,
  recipes,
  recipeSizes,
  stockBatches,
  stockMovements,
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

  listCatalogRecipes() {
    return this.db
      .select({
        recipeId: recipes.id,
        name: recipes.name,
        categoryId: categories.id,
        categoryName: categories.name,
        parentCategoryId: categories.parentId,
        parentCategoryName: parentCategory.name,
        sizeId: recipeSizes.id,
        sizeName: recipeSizes.name,
        sellingPrice: recipeSizes.sellingPrice,
        sortOrder: recipeSizes.sortOrder,
      })
      .from(recipes)
      .innerJoin(categories, eq(recipes.categoryId, categories.id))
      .leftJoin(parentCategory, eq(categories.parentId, parentCategory.id))
      .innerJoin(recipeSizes, eq(recipeSizes.recipeId, recipes.id))
      .where(
        and(
          eq(recipes.type, "product"),
          eq(recipes.isActive, true),
          eq(categories.isActive, true),
          or(isNull(categories.parentId), eq(parentCategory.isActive, true)),
          isNotNull(recipeSizes.sellingPrice),
        ),
      )
      .orderBy(
        asc(parentCategory.name),
        asc(categories.name),
        asc(recipes.name),
        asc(recipeSizes.sortOrder),
        asc(recipeSizes.id),
      );
  }

  listCatalogItems() {
    return this.db
      .select({
        itemId: items.id,
        name: items.name,
        categoryId: categories.id,
        categoryName: categories.name,
        parentCategoryId: categories.parentId,
        parentCategoryName: parentCategory.name,
        sellingPrice: items.sellingPrice,
        stockUnit: items.stockUnit,
      })
      .from(items)
      .innerJoin(categories, eq(items.categoryId, categories.id))
      .leftJoin(parentCategory, eq(categories.parentId, parentCategory.id))
      .where(
        and(
          eq(items.type, "resale"),
          eq(items.isActive, true),
          eq(categories.isActive, true),
          or(isNull(categories.parentId), eq(parentCategory.isActive, true)),
          isNotNull(items.sellingPrice),
        ),
      )
      .orderBy(asc(parentCategory.name), asc(categories.name), asc(items.name));
  }

  lockRecipeSizes(ids: number[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db
      .select({
        sizeId: recipeSizes.id,
        sizeName: recipeSizes.name,
        sellingPrice: recipeSizes.sellingPrice,
        recipeId: recipes.id,
        recipeName: recipes.name,
        recipeType: recipes.type,
        recipeIsActive: recipes.isActive,
      })
      .from(recipeSizes)
      .innerJoin(recipes, eq(recipeSizes.recipeId, recipes.id))
      .where(
        inArray(
          recipeSizes.id,
          [...new Set(ids)].sort((a, b) => a - b),
        ),
      )
      .orderBy(asc(recipeSizes.id))
      .for("update");
  }

  listIngredientsForSizes(ids: number[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db
      .select({
        recipeSizeId: recipeIngredients.recipeSizeId,
        itemId: recipeIngredients.itemId,
        itemName: items.name,
        quantity: recipeIngredients.quantity,
      })
      .from(recipeIngredients)
      .innerJoin(items, eq(recipeIngredients.itemId, items.id))
      .where(inArray(recipeIngredients.recipeSizeId, ids))
      .orderBy(
        asc(recipeIngredients.recipeSizeId),
        asc(recipeIngredients.itemId),
      );
  }

  lockResaleItems(ids: number[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db
      .select({
        id: items.id,
        name: items.name,
        type: items.type,
        sellingPrice: items.sellingPrice,
        isActive: items.isActive,
      })
      .from(items)
      .where(
        inArray(
          items.id,
          [...new Set(ids)].sort((a, b) => a - b),
        ),
      )
      .orderBy(asc(items.id))
      .for("update");
  }

  lockStockItems(ids: number[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db
      .select({
        id: items.id,
        name: items.name,
        isActive: items.isActive,
      })
      .from(items)
      .where(
        inArray(
          items.id,
          [...new Set(ids)].sort((a, b) => a - b),
        ),
      )
      .orderBy(asc(items.id))
      .for("update");
  }

  async createOrder(data: typeof orders.$inferInsert) {
    const [result] = await this.db.insert(orders).values(data);
    return result.insertId;
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
      .select({
        id: orderLines.id,
        type: orderLines.type,
        recipeId: orderLines.recipeId,
        recipeSizeId: orderLines.recipeSizeId,
        itemId: orderLines.itemId,
        productName: orderLines.productName,
        sizeName: orderLines.sizeName,
        quantity: orderLines.quantity,
        unitPrice: orderLines.unitPrice,
        lineSubtotal: orderLines.lineSubtotal,
        totalCost: orderLines.totalCost,
        hasStockDeficit: orderLines.hasStockDeficit,
      })
      .from(orderLines)
      .where(eq(orderLines.orderId, orderId))
      .orderBy(asc(orderLines.id));
  }

  listAllocations(orderLineIds: number[]) {
    if (orderLineIds.length === 0) return Promise.resolve([]);
    return this.db
      .select({
        id: orderLineAllocations.id,
        orderLineId: orderLineAllocations.orderLineId,
        itemId: orderLineAllocations.itemId,
        itemName: orderLineAllocations.itemName,
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
      .leftJoin(stockBatches, eq(orderLineAllocations.batchId, stockBatches.id))
      .innerJoin(
        stockMovements,
        eq(orderLineAllocations.stockMovementId, stockMovements.id),
      )
      .where(inArray(orderLineAllocations.orderLineId, orderLineIds))
      .orderBy(asc(orderLineAllocations.id));
  }
}
