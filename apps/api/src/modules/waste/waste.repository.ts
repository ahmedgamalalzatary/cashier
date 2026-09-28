import {
  branchCondition,
  branchValues,
  branchTransaction,
} from "../../db/branch-context.js";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import {
  items,
  recipeIngredients,
  recipes,
  recipeSizes,
  shifts,
  users,
  wasteAllocations,
  wasteEntries,
} from "../../db/schema.js";
import { InventoryRepository } from "../inventory/inventory.repository.js";
import { InventoryTransaction } from "../inventory/inventory.service.js";
import { OrdersRepository } from "../orders/orders.repository.js";

export class WasteRepository {
  constructor(private db: Db) {}

  transaction<T>(
    fn: (repo: WasteRepository, inventory: InventoryTransaction) => Promise<T>,
  ) {
    return branchTransaction(this.db, (tx) => {
      const transactionDb = tx as unknown as Db;
      return fn(
        new WasteRepository(transactionDb),
        new InventoryTransaction(new InventoryRepository(transactionDb)),
      );
    });
  }

  async findOpenShiftForCashier(userId: number) {
    const [row] = await this.db
      .select({ id: shifts.id })
      .from(shifts)
      .where(
        branchCondition(
          shifts,
          and(eq(shifts.openSlot, 1), eq(shifts.cashierUserId, userId)),
        ),
      )
      .for("update");
    return row;
  }

  async findItem(id: number) {
    const [row] = await this.db
      .select({
        id: items.id,
        name: items.name,
        stockUnit: items.stockUnit,
        isActive: items.isActive,
      })
      .from(items)
      .where(branchCondition(items, eq(items.id, id)))
      .for("update");
    return row;
  }

  async findByClientRequestId(clientRequestId: string) {
    const [row] = await this.db
      .select({
        id: wasteEntries.id,
        requestFingerprint: wasteEntries.requestFingerprint,
        recordedBy: wasteEntries.recordedBy,
      })
      .from(wasteEntries)
      .where(
        branchCondition(
          wasteEntries,
          eq(wasteEntries.clientRequestId, clientRequestId),
        ),
      );
    return row;
  }

  async create(data: typeof wasteEntries.$inferInsert) {
    const [result] = await this.db
      .insert(wasteEntries)
      .values(branchValues(data));
    return result.insertId;
  }

  createAllocation(data: typeof wasteAllocations.$inferInsert) {
    return this.db.insert(wasteAllocations).values(branchValues(data));
  }

  updateCost(id: number, totalCost: string) {
    return this.db
      .update(wasteEntries)
      .set({ totalCost })
      .where(branchCondition(wasteEntries, eq(wasteEntries.id, id)));
  }

  listCatalogItems() {
    return this.db
      .select({ id: items.id, name: items.name, stockUnit: items.stockUnit })
      .from(items)
      .where(branchCondition(items, eq(items.isActive, true)))
      .orderBy(asc(items.name));
  }

  async loadExternalProduct(externalProductId: number) {
    const [product] = await new OrdersRepository(this.db).loadExternalProducts([
      externalProductId,
    ]);
    return product;
  }

  lockStockItems(ids: number[]) {
    return new OrdersRepository(this.db).lockStockItems(ids);
  }

  async loadRecipeProduct(recipeId: number, recipeSizeId: number) {
    const [recipe] = await this.db
      .select({
        recipeId: recipes.id,
        recipeName: recipes.name,
        isActive: recipes.isActive,
      })
      .from(recipes)
      .where(branchCondition(recipes, eq(recipes.id, recipeId)))
      .for("update");
    if (!recipe) return undefined;
    const [size] = await this.db
      .select({ sizeId: recipeSizes.id, sizeName: recipeSizes.name })
      .from(recipeSizes)
      .where(
        branchCondition(
          recipeSizes,
          and(
            eq(recipeSizes.id, recipeSizeId),
            eq(recipeSizes.recipeId, recipeId),
          ),
        ),
      )
      .for("update");
    if (!size) throw new Error("RECIPE_SIZE_MISMATCH");
    const ingredientRows = await this.db
      .select({
        itemId: recipeIngredients.itemId,
        quantity: recipeIngredients.quantity,
      })
      .from(recipeIngredients)
      .where(
        branchCondition(
          recipeIngredients,
          eq(recipeIngredients.recipeSizeId, recipeSizeId),
        ),
      )
      .orderBy(asc(recipeIngredients.id))
      .for("update");
    const stockItems = await this.lockStockItems(
      ingredientRows.map((row) => row.itemId),
    );
    const itemsById = new Map(stockItems.map((item) => [item.id, item]));
    const ingredients = ingredientRows.flatMap((row) => {
      const item = itemsById.get(row.itemId);
      return item ? [{ ...row, itemName: item.name }] : [];
    });
    return { ...recipe, ...size, ingredients };
  }

  async listCatalogExternalProducts() {
    const orders = new OrdersRepository(this.db);
    const ids = await orders.listCurrentExternalProductIds();
    const products = await orders.loadExternalProducts(
      ids.map((row) => row.externalId),
    );
    const result: Array<{
      externalProductId: number;
      externalSizeId: number | null;
      productName: string;
      sizeName: string | null;
    }> = [];
    for (const product of products) {
      if (product.sizes.length > 0) {
        for (const size of product.sizes) {
          if (size.ingredients.length > 0) {
            result.push({
              externalProductId: product.externalId,
              externalSizeId: size.externalId,
              productName: product.nameAr,
              sizeName: size.nameAr,
            });
          }
        }
      } else if (product.ingredients.length > 0) {
        result.push({
          externalProductId: product.externalId,
          externalSizeId: null,
          productName: product.nameAr,
          sizeName: null,
        });
      }
    }
    return result;
  }

  async listCatalogRecipes() {
    const rows = await this.db
      .select({
        recipeId: recipes.id,
        recipeName: recipes.name,
        recipeSizeId: recipeSizes.id,
        sizeName: recipeSizes.name,
      })
      .from(recipes)
      .innerJoin(
        recipeSizes,
        branchCondition(recipeSizes, eq(recipeSizes.recipeId, recipes.id)),
      )
      .innerJoin(
        recipeIngredients,
        branchCondition(
          recipeIngredients,
          eq(recipeIngredients.recipeSizeId, recipeSizes.id),
        ),
      )
      .where(branchCondition(recipes, eq(recipes.isActive, true)))
      .orderBy(asc(recipes.name), asc(recipeSizes.sortOrder));
    const seen = new Set<string>();
    const result: Array<{
      recipeId: number;
      recipeSizeId: number;
      recipeName: string;
      sizeName: string | null;
    }> = [];
    for (const row of rows) {
      const key = `${row.recipeId}:${row.recipeSizeId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(row);
    }
    return result;
  }

  list(warehouse?: "cafe") {
    const query = this.db
      .select({
        id: wasteEntries.id,
        shiftId: wasteEntries.shiftId,
        warehouse: wasteEntries.warehouse,
        targetType: wasteEntries.targetType,
        targetName: wasteEntries.targetName,
        sizeName: wasteEntries.sizeName,
        quantity: wasteEntries.quantity,
        reason: wasteEntries.reasonCode,
        note: wasteEntries.note,
        totalCost: wasteEntries.totalCost,
        recordedBy: wasteEntries.recordedBy,
        recordedByName: users.name,
        occurredAt: wasteEntries.occurredAt,
      })
      .from(wasteEntries)
      .innerJoin(users, eq(wasteEntries.recordedBy, users.id))
      .$dynamic()
      .where(branchCondition(wasteEntries));
    return (
      warehouse
        ? query.where(
            branchCondition(
              wasteEntries,
              eq(wasteEntries.warehouse, warehouse),
            ),
          )
        : query
    )
      .orderBy(desc(wasteEntries.occurredAt), desc(wasteEntries.id))
      .limit(100);
  }

  async find(id: number) {
    const [row] = await this.db
      .select({
        id: wasteEntries.id,
        shiftId: wasteEntries.shiftId,
        warehouse: wasteEntries.warehouse,
        targetType: wasteEntries.targetType,
        targetName: wasteEntries.targetName,
        sizeName: wasteEntries.sizeName,
        quantity: wasteEntries.quantity,
        reason: wasteEntries.reasonCode,
        note: wasteEntries.note,
        totalCost: wasteEntries.totalCost,
        recordedBy: wasteEntries.recordedBy,
        recordedByName: users.name,
        occurredAt: wasteEntries.occurredAt,
      })
      .from(wasteEntries)
      .innerJoin(users, eq(wasteEntries.recordedBy, users.id))
      .where(branchCondition(wasteEntries, eq(wasteEntries.id, id)));
    return row;
  }

  allocations(id: number) {
    return this.db
      .select({
        id: wasteAllocations.id,
        itemId: wasteAllocations.itemId,
        itemName: wasteAllocations.itemName,
        batchId: wasteAllocations.batchId,
        quantity: wasteAllocations.quantity,
        unitCost: wasteAllocations.unitCost,
      })
      .from(wasteAllocations)
      .where(
        branchCondition(
          wasteAllocations,
          eq(wasteAllocations.wasteEntryId, id),
        ),
      )
      .orderBy(asc(wasteAllocations.id));
  }
}
