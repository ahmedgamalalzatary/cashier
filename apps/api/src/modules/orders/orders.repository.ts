import {
  branchCondition,
  branchValues,
  branchTransaction,
} from "@cashier/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@cashier/db";
import {
  externalModifierGroups,
  externalModifierIngredients,
  externalModifierOptions,
  externalProductIngredients,
  externalProducts,
  externalProductSizes,
  externalSizeIngredients,
  items,
  orderLineAllocations,
  orderLineModifiers,
  orderLines,
  orders,
  stockBatches,
  stockMovements,
  shifts,
  users,
} from "@cashier/db";
import { InventoryRepository } from "../inventory/inventory.repository.js";
import { InventoryTransaction } from "../inventory/inventory.service.js";

export class OrdersRepository {
  constructor(private db: Db) {}

  transaction<T>(
    fn: (repo: OrdersRepository, inventory: InventoryTransaction) => Promise<T>,
  ): Promise<T> {
    return branchTransaction(this.db, (tx) => {
      const transactionDb = tx as unknown as Db;
      return fn(
        new OrdersRepository(transactionDb),
        new InventoryTransaction(new InventoryRepository(transactionDb)),
      );
    });
  }

  lockStockItems(ids: number[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db
      .select({
        id: items.id,
        name: items.name,
        isActive: items.isActive,
        type: items.type,
        sellingPrice: items.sellingPrice,
      })
      .from(items)
      .where(
        branchCondition(
          items,
          inArray(
            items.id,
            [...new Set(ids)].sort((a, b) => a - b),
          ),
        ),
      )
      .orderBy(asc(items.id))
      .for("update");
  }

  async loadExternalProducts(ids: number[]) {
    if (ids.length === 0) return [];
    const productIds = [...new Set(ids)].sort((a, b) => a - b);
    const productsRows = await this.db
      .select()
      .from(externalProducts)
      .where(
        branchCondition(
          externalProducts,
          inArray(externalProducts.externalId, productIds),
        ),
      )
      .orderBy(asc(externalProducts.externalId))
      .for("update");
    const [sizes, groups, baseIngredients] = await Promise.all([
      this.db
        .select()
        .from(externalProductSizes)
        .where(
          branchCondition(
            externalProductSizes,
            inArray(externalProductSizes.externalProductId, productIds),
          ),
        ),
      this.db
        .select()
        .from(externalModifierGroups)
        .where(
          branchCondition(
            externalModifierGroups,
            inArray(externalModifierGroups.externalProductId, productIds),
          ),
        ),
      this.db
        .select({
          externalProductId: externalProductIngredients.externalProductId,
          itemId: externalProductIngredients.itemId,
          itemName: items.name,
          quantity: externalProductIngredients.quantity,
        })
        .from(externalProductIngredients)
        .innerJoin(
          items,
          branchCondition(
            items,
            eq(externalProductIngredients.itemId, items.id),
          ),
        )
        .where(
          branchCondition(
            externalProductIngredients,
            inArray(externalProductIngredients.externalProductId, productIds),
          ),
        ),
    ]);

    // Every follow-up read is scoped to the ids of the rows already loaded, so
    // a sale never scans the whole catalog while holding its product locks.
    const groupIds = groups.map((group) => group.externalId);
    const sizeIds = sizes.map((size) => size.externalId);
    const [options, sizeIngredients] = await Promise.all([
      groupIds.length === 0
        ? []
        : this.db
            .select()
            .from(externalModifierOptions)
            .where(
              branchCondition(
                externalModifierOptions,
                inArray(
                  externalModifierOptions.externalModifierGroupId,
                  groupIds,
                ),
              ),
            ),
      sizeIds.length === 0
        ? []
        : this.db
            .select({
              externalSizeId: externalSizeIngredients.externalSizeId,
              itemId: externalSizeIngredients.itemId,
              itemName: items.name,
              quantity: externalSizeIngredients.quantity,
            })
            .from(externalSizeIngredients)
            .innerJoin(
              items,
              branchCondition(
                items,
                eq(externalSizeIngredients.itemId, items.id),
              ),
            )
            .where(
              branchCondition(
                externalSizeIngredients,
                inArray(externalSizeIngredients.externalSizeId, sizeIds),
              ),
            ),
    ]);

    const optionIds = options.map((option) => option.externalId);
    const modifierIngredients =
      optionIds.length === 0
        ? []
        : await this.db
            .select({
              externalModifierOptionId:
                externalModifierIngredients.externalModifierOptionId,
              itemId: externalModifierIngredients.itemId,
              itemName: items.name,
              quantity: externalModifierIngredients.quantity,
            })
            .from(externalModifierIngredients)
            .innerJoin(
              items,
              branchCondition(
                items,
                eq(externalModifierIngredients.itemId, items.id),
              ),
            )
            .where(
              branchCondition(
                externalModifierIngredients,
                inArray(
                  externalModifierIngredients.externalModifierOptionId,
                  optionIds,
                ),
              ),
            );

    return productsRows.map((product) => ({
      ...product,
      ingredients: baseIngredients.filter(
        (ingredient) => ingredient.externalProductId === product.externalId,
      ),
      sizes: sizes
        .filter(
          (size) =>
            size.externalProductId === product.externalId && size.isCurrent,
        )
        .map((size) => ({
          ...size,
          ingredients: sizeIngredients.filter(
            (ingredient) => ingredient.externalSizeId === size.externalId,
          ),
        })),
      modifierGroups: groups
        .filter(
          (group) =>
            group.externalProductId === product.externalId && group.isCurrent,
        )
        .map((group) => ({
          ...group,
          options: options
            .filter(
              (option) =>
                option.externalModifierGroupId === group.externalId &&
                option.isCurrent,
            )
            .map((option) => ({
              ...option,
              ingredients: modifierIngredients.filter(
                (ingredient) =>
                  ingredient.externalModifierOptionId === option.externalId,
              ),
            })),
        })),
    }));
  }

  listCurrentExternalProductIds() {
    return this.db
      .select({ externalId: externalProducts.externalId })
      .from(externalProducts)
      .where(
        branchCondition(externalProducts, eq(externalProducts.isCurrent, true)),
      )
      .orderBy(asc(externalProducts.externalId));
  }

  async createOrder(data: typeof orders.$inferInsert) {
    const [result] = await this.db.insert(orders).values(branchValues(data));
    return result.insertId;
  }

  async findOpenShiftForCashier(cashierUserId: number) {
    const [row] = await this.db
      .select({ id: shifts.id })
      .from(shifts)
      .where(
        branchCondition(
          shifts,
          and(eq(shifts.openSlot, 1), eq(shifts.cashierUserId, cashierUserId)),
        ),
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
      .where(
        branchCondition(orders, eq(orders.clientRequestId, clientRequestId)),
      );
    return row;
  }

  async createLine(data: typeof orderLines.$inferInsert) {
    const [result] = await this.db
      .insert(orderLines)
      .values(branchValues(data));
    return result.insertId;
  }

  async createLineModifier(data: typeof orderLineModifiers.$inferInsert) {
    await this.db.insert(orderLineModifiers).values(branchValues(data));
  }

  async updateLine(
    id: number,
    data: Pick<typeof orderLines.$inferInsert, "totalCost" | "hasStockDeficit">,
  ) {
    await this.db
      .update(orderLines)
      .set(data)
      .where(branchCondition(orderLines, eq(orderLines.id, id)));
  }

  async updateOrder(
    id: number,
    data: Pick<typeof orders.$inferInsert, "totalCost" | "isNegativeStock">,
  ) {
    await this.db
      .update(orders)
      .set(data)
      .where(branchCondition(orders, eq(orders.id, id)));
  }

  async createAllocation(data: typeof orderLineAllocations.$inferInsert) {
    await this.db.insert(orderLineAllocations).values(branchValues(data));
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
        isAdminSale: orders.isAdminSale,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .innerJoin(users, eq(orders.cashierId, users.id))
      .where(branchCondition(orders))
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
        isAdminSale: orders.isAdminSale,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .innerJoin(users, eq(orders.cashierId, users.id))
      .where(branchCondition(orders, eq(orders.id, id)));
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
        externalProductId: orderLines.externalProductId,
        externalSizeId: orderLines.externalSizeId,
        productName: orderLines.productName,
        sizeName: orderLines.sizeName,
        quantity: orderLines.quantity,
        unitPrice: orderLines.unitPrice,
        lineSubtotal: orderLines.lineSubtotal,
        totalCost: orderLines.totalCost,
        hasStockDeficit: orderLines.hasStockDeficit,
      })
      .from(orderLines)
      .where(branchCondition(orderLines, eq(orderLines.orderId, orderId)))
      .orderBy(asc(orderLines.id));
  }

  listAllocations(orderLineIds: number[]) {
    if (orderLineIds.length === 0) return Promise.resolve([]);
    return this.db
      .select({
        id: orderLineAllocations.id,
        orderLineId: orderLineAllocations.orderLineId,
        itemId: orderLineAllocations.itemId,
        // name is snapshotted (items can be renamed); the code never changes
        itemCode: items.code,
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
      .innerJoin(
        items,
        branchCondition(items, eq(orderLineAllocations.itemId, items.id)),
      )
      .leftJoin(
        stockBatches,
        branchCondition(
          stockBatches,
          eq(orderLineAllocations.batchId, stockBatches.id),
        ),
      )
      .innerJoin(
        stockMovements,
        branchCondition(
          stockMovements,
          eq(orderLineAllocations.stockMovementId, stockMovements.id),
        ),
      )
      .where(
        branchCondition(
          orderLineAllocations,
          inArray(orderLineAllocations.orderLineId, orderLineIds),
        ),
      )
      .orderBy(asc(orderLineAllocations.id));
  }

  listModifiers(orderLineIds: number[]) {
    if (orderLineIds.length === 0) return Promise.resolve([]);
    return this.db
      .select()
      .from(orderLineModifiers)
      .where(
        branchCondition(
          orderLineModifiers,
          inArray(orderLineModifiers.orderLineId, orderLineIds),
        ),
      )
      .orderBy(asc(orderLineModifiers.id));
  }
}
