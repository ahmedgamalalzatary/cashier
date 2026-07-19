import {
  asc,
  desc,
  eq,
  inArray,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import type { Db } from '../../db/index.js';
import {
  categories,
  items,
  preparationAllocations,
  preparations,
  recipeIngredients,
  recipes,
  recipeSizes,
  stockBatches,
  users,
} from '../../db/schema.js';
import { InventoryRepository } from '../inventory/inventory.repository.js';
import { InventoryTransaction } from '../inventory/inventory.service.js';

const outputItem = alias(items, 'recipe_output_item');
const preparer = alias(users, 'preparation_preparer');

export class RecipesRepository {
  constructor(private db: Db) {}

  transaction<T>(
    fn: (
      repo: RecipesRepository,
      inventory: InventoryTransaction,
    ) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction((tx) => {
      const transactionDb = tx as unknown as Db;
      return fn(
        new RecipesRepository(transactionDb),
        new InventoryTransaction(new InventoryRepository(transactionDb)),
      );
    });
  }

  listRecipeHeaders() {
    return this.db
      .select({
        id: recipes.id,
        name: recipes.name,
        type: recipes.type,
        categoryId: recipes.categoryId,
        categoryName: categories.name,
        outputItemId: recipes.outputItemId,
        outputItemName: outputItem.name,
        outputStockUnit: outputItem.stockUnit,
        isActive: recipes.isActive,
        createdAt: recipes.createdAt,
        updatedAt: recipes.updatedAt,
      })
      .from(recipes)
      .innerJoin(categories, eq(recipes.categoryId, categories.id))
      .leftJoin(outputItem, eq(recipes.outputItemId, outputItem.id))
      .orderBy(desc(recipes.createdAt), desc(recipes.id));
  }

  async findRecipeHeader(id: number) {
    const [row] = await this.db
      .select({
        id: recipes.id,
        name: recipes.name,
        type: recipes.type,
        categoryId: recipes.categoryId,
        categoryName: categories.name,
        outputItemId: recipes.outputItemId,
        outputItemName: outputItem.name,
        outputStockUnit: outputItem.stockUnit,
        isActive: recipes.isActive,
        createdAt: recipes.createdAt,
        updatedAt: recipes.updatedAt,
      })
      .from(recipes)
      .innerJoin(categories, eq(recipes.categoryId, categories.id))
      .leftJoin(outputItem, eq(recipes.outputItemId, outputItem.id))
      .where(eq(recipes.id, id));
    return row;
  }

  async lockRecipe(id: number) {
    const [row] = await this.db
      .select()
      .from(recipes)
      .where(eq(recipes.id, id))
      .for('update');
    return row;
  }

  async findCategory(id: number) {
    const childCount = sql<number>`(
      SELECT COUNT(*) FROM categories child WHERE child.parent_id = ${categories.id}
    )`;
    const [row] = await this.db
      .select({
        id: categories.id,
        isActive: categories.isActive,
        childCount,
      })
      .from(categories)
      .where(eq(categories.id, id))
      .for('update');
    return row;
  }

  lockItems(ids: number[]) {
    const orderedIds = [...new Set(ids)].sort((a, b) => a - b);
    return this.db
      .select({
        id: items.id,
        name: items.name,
        type: items.type,
        stockUnit: items.stockUnit,
        isActive: items.isActive,
      })
      .from(items)
      .where(inArray(items.id, orderedIds))
      .orderBy(asc(items.id))
      .for('update');
  }

  async findRecipeByOutputItem(outputItemId: number, exceptId?: number) {
    const [row] = await this.db
      .select({ id: recipes.id })
      .from(recipes)
      .where(
        exceptId === undefined
          ? eq(recipes.outputItemId, outputItemId)
          : sql`${recipes.outputItemId} = ${outputItemId} AND ${recipes.id} <> ${exceptId}`,
      );
    return row;
  }

  listPreparedEdges() {
    return this.db
      .select({
        recipeId: recipes.id,
        outputItemId: recipes.outputItemId,
        ingredientItemId: recipeIngredients.itemId,
      })
      .from(recipes)
      .innerJoin(recipeSizes, eq(recipeSizes.recipeId, recipes.id))
      .innerJoin(
        recipeIngredients,
        eq(recipeIngredients.recipeSizeId, recipeSizes.id),
      )
      .where(eq(recipes.type, 'prepared'));
  }

  async createRecipe(data: {
    name: string;
    type: 'product' | 'prepared';
    categoryId: number;
    outputItemId: number | null;
  }) {
    const [result] = await this.db.insert(recipes).values(data);
    return result.insertId;
  }

  async updateRecipe(
    id: number,
    data: {
      name: string;
      type: 'product' | 'prepared';
      categoryId: number;
      outputItemId: number | null;
    },
  ) {
    await this.db.update(recipes).set(data).where(eq(recipes.id, id));
  }

  async createSize(data: {
    recipeId: number;
    name: string;
    sellingPrice: string | null;
    outputQuantity: string | null;
    sortOrder: number;
  }) {
    const [result] = await this.db.insert(recipeSizes).values(data);
    return result.insertId;
  }

  async createIngredient(data: {
    recipeSizeId: number;
    itemId: number;
    quantity: string;
  }) {
    await this.db.insert(recipeIngredients).values(data);
  }

  async deleteRecipeChildren(recipeId: number) {
    const sizes = await this.db
      .select({ id: recipeSizes.id })
      .from(recipeSizes)
      .where(eq(recipeSizes.recipeId, recipeId));
    const sizeIds = sizes.map((size) => size.id);
    if (sizeIds.length > 0) {
      await this.db
        .delete(recipeIngredients)
        .where(inArray(recipeIngredients.recipeSizeId, sizeIds));
    }
    await this.db.delete(recipeSizes).where(eq(recipeSizes.recipeId, recipeId));
  }

  listSizes(recipeId: number) {
    return this.db
      .select()
      .from(recipeSizes)
      .where(eq(recipeSizes.recipeId, recipeId))
      .orderBy(recipeSizes.sortOrder, recipeSizes.id);
  }

  listIngredients(recipeId: number) {
    return this.db
      .select({
        id: recipeIngredients.id,
        recipeSizeId: recipeIngredients.recipeSizeId,
        itemId: recipeIngredients.itemId,
        itemName: items.name,
        itemType: items.type,
        stockUnit: items.stockUnit,
        quantity: recipeIngredients.quantity,
        itemIsActive: items.isActive,
      })
      .from(recipeIngredients)
      .innerJoin(
        recipeSizes,
        eq(recipeIngredients.recipeSizeId, recipeSizes.id),
      )
      .innerJoin(items, eq(recipeIngredients.itemId, items.id))
      .where(eq(recipeSizes.recipeId, recipeId))
      .orderBy(recipeSizes.sortOrder, recipeIngredients.id);
  }

  availableCafeBatches(itemId: number) {
    return this.db
      .select({
        id: stockBatches.id,
        remainingQuantity: stockBatches.remainingQuantity,
        unitCost: stockBatches.unitCost,
      })
      .from(stockBatches)
      .where(
        sql`${stockBatches.itemId} = ${itemId} AND ${stockBatches.warehouse} = 'cafe' AND ${stockBatches.remainingQuantity} > 0`,
      )
      .orderBy(stockBatches.receivedAt, stockBatches.id);
  }

  async setActive(id: number, isActive: boolean) {
    await this.db.update(recipes).set({ isActive }).where(eq(recipes.id, id));
  }

  async createPreparation(data: {
    recipeId: number;
    recipeName: string;
    outputItemId: number;
    outputItemName: string;
    producedQuantity: string;
    preparedBy: number;
    notes: string | null;
    occurredAt: Date;
  }) {
    const [result] = await this.db.insert(preparations).values({
      ...data,
      totalCost: '0.00',
      unitCost: '0.000000',
      outputBatchId: null,
    });
    return result.insertId;
  }

  async completePreparation(
    id: number,
    data: { totalCost: string; unitCost: string; outputBatchId: number },
  ) {
    await this.db.update(preparations).set(data).where(eq(preparations.id, id));
  }

  async createPreparationAllocation(data: {
    preparationId: number;
    ingredientItemId: number;
    ingredientItemName: string;
    quantity: string;
    unitCost: string;
    sourceBatchId: number;
  }) {
    await this.db.insert(preparationAllocations).values(data);
  }

  listPreparations() {
    return this.db
      .select({
        id: preparations.id,
        recipeId: preparations.recipeId,
        recipeName: preparations.recipeName,
        outputItemId: preparations.outputItemId,
        outputItemName: preparations.outputItemName,
        outputStockUnit: outputItem.stockUnit,
        producedQuantity: preparations.producedQuantity,
        totalCost: preparations.totalCost,
        unitCost: preparations.unitCost,
        outputBatchId: preparations.outputBatchId,
        preparedBy: preparations.preparedBy,
        preparedByName: preparer.name,
        notes: preparations.notes,
        occurredAt: preparations.occurredAt,
        createdAt: preparations.createdAt,
      })
      .from(preparations)
      .innerJoin(preparer, eq(preparations.preparedBy, preparer.id))
      .innerJoin(outputItem, eq(preparations.outputItemId, outputItem.id))
      .orderBy(desc(preparations.occurredAt), desc(preparations.id));
  }

  async findPreparation(id: number) {
    const [row] = await this.db
      .select({
        id: preparations.id,
        recipeId: preparations.recipeId,
        recipeName: preparations.recipeName,
        outputItemId: preparations.outputItemId,
        outputItemName: preparations.outputItemName,
        outputStockUnit: outputItem.stockUnit,
        producedQuantity: preparations.producedQuantity,
        totalCost: preparations.totalCost,
        unitCost: preparations.unitCost,
        outputBatchId: preparations.outputBatchId,
        preparedBy: preparations.preparedBy,
        preparedByName: preparer.name,
        notes: preparations.notes,
        occurredAt: preparations.occurredAt,
        createdAt: preparations.createdAt,
      })
      .from(preparations)
      .innerJoin(preparer, eq(preparations.preparedBy, preparer.id))
      .innerJoin(outputItem, eq(preparations.outputItemId, outputItem.id))
      .where(eq(preparations.id, id));
    return row;
  }

  listPreparationAllocations(preparationId: number) {
    return this.db
      .select({
        id: preparationAllocations.id,
        ingredientItemId: preparationAllocations.ingredientItemId,
        ingredientItemName: preparationAllocations.ingredientItemName,
        stockUnit: items.stockUnit,
        quantity: preparationAllocations.quantity,
        unitCost: preparationAllocations.unitCost,
        lineCost: sql<string>`CAST(ROUND(${preparationAllocations.quantity} * ${preparationAllocations.unitCost}, 2) AS DECIMAL(30,2))`,
        sourceBatchId: preparationAllocations.sourceBatchId,
      })
      .from(preparationAllocations)
      .innerJoin(items, eq(preparationAllocations.ingredientItemId, items.id))
      .where(eq(preparationAllocations.preparationId, preparationId))
      .orderBy(preparationAllocations.id);
  }
}
