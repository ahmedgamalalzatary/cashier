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

export class WasteRepository {
  constructor(private db: Db) {}

  transaction<T>(
    fn: (repo: WasteRepository, inventory: InventoryTransaction) => Promise<T>,
  ) {
    return this.db.transaction((tx) => {
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
      .where(and(eq(shifts.openSlot, 1), eq(shifts.cashierUserId, userId)))
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
      .where(eq(items.id, id))
      .for("update");
    return row;
  }

  async findRecipeSize(id: number) {
    const [row] = await this.db
      .select({
        recipeSizeId: recipeSizes.id,
        sizeName: recipeSizes.name,
        recipeId: recipes.id,
        recipeName: recipes.name,
        recipeType: recipes.type,
        isActive: recipes.isActive,
      })
      .from(recipeSizes)
      .innerJoin(recipes, eq(recipeSizes.recipeId, recipes.id))
      .where(eq(recipeSizes.id, id))
      .for("update");
    return row;
  }

  ingredients(recipeSizeId: number) {
    return this.db
      .select({
        itemId: items.id,
        itemName: items.name,
        quantity: recipeIngredients.quantity,
      })
      .from(recipeIngredients)
      .innerJoin(items, eq(recipeIngredients.itemId, items.id))
      .where(eq(recipeIngredients.recipeSizeId, recipeSizeId))
      .orderBy(asc(items.id));
  }

  async findByClientRequestId(clientRequestId: string) {
    const [row] = await this.db
      .select({
        id: wasteEntries.id,
        requestFingerprint: wasteEntries.requestFingerprint,
        recordedBy: wasteEntries.recordedBy,
      })
      .from(wasteEntries)
      .where(eq(wasteEntries.clientRequestId, clientRequestId));
    return row;
  }

  async create(data: typeof wasteEntries.$inferInsert) {
    const [result] = await this.db.insert(wasteEntries).values(data);
    return result.insertId;
  }

  createAllocation(data: typeof wasteAllocations.$inferInsert) {
    return this.db.insert(wasteAllocations).values(data);
  }

  updateCost(id: number, totalCost: string) {
    return this.db
      .update(wasteEntries)
      .set({ totalCost })
      .where(eq(wasteEntries.id, id));
  }

  listCatalogItems() {
    return this.db
      .select({ id: items.id, name: items.name, stockUnit: items.stockUnit })
      .from(items)
      .where(eq(items.isActive, true))
      .orderBy(asc(items.name));
  }

  listCatalogRecipes() {
    return this.db
      .select({
        recipeId: recipes.id,
        recipeName: recipes.name,
        recipeSizeId: recipeSizes.id,
        sizeName: recipeSizes.name,
      })
      .from(recipes)
      .innerJoin(recipeSizes, eq(recipeSizes.recipeId, recipes.id))
      .where(and(eq(recipes.isActive, true), eq(recipes.type, "product")))
      .orderBy(
        asc(recipes.name),
        asc(recipeSizes.sortOrder),
        asc(recipeSizes.id),
      );
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
      .innerJoin(users, eq(wasteEntries.recordedBy, users.id));
    return (
      warehouse ? query.where(eq(wasteEntries.warehouse, warehouse)) : query
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
      .where(eq(wasteEntries.id, id));
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
      .where(eq(wasteAllocations.wasteEntryId, id))
      .orderBy(asc(wasteAllocations.id));
  }
}
