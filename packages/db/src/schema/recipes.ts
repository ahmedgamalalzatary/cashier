import {
  mysqlTable,
  varchar,
  int,
  decimal,
  boolean,
  timestamp,
  text,
  mysqlEnum,
  index,
  uniqueIndex,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { id, uuidColumn } from "../uuid.js";
import { branchColumn, scopedReference } from "./base.js";
import { users } from "./org.js";
import { categories, items } from "./catalog.js";
import { stockBatches } from "./purchasing.js";

export const recipes = mysqlTable(
  "recipes",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    name: varchar("name", { length: 191 }).notNull(),
    type: mysqlEnum("type", ["product", "prepared"]).notNull(),
    categoryId: uuidColumn("category_id")
      .notNull()
      .references(() => categories.id),
    outputItemId: uuidColumn("output_item_id").references(() => items.id),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("recipes_branch_id_uidx").on(table.branchId, table.id),
    scopedReference(
      "recipes_categoryId_br_fk",
      table.branchId,
      table.categoryId,
      (): AnyMySqlColumn => categories.branchId,
      (): AnyMySqlColumn => categories.id,
    ),
    scopedReference(
      "recipes_outputItemId_br_fk",
      table.branchId,
      table.outputItemId,
      (): AnyMySqlColumn => items.branchId,
      (): AnyMySqlColumn => items.id,
    ),
    index("recipes_category_id_idx").on(table.categoryId),
    uniqueIndex("recipes_output_item_id_uidx").on(
      table.branchId,
      table.outputItemId,
    ),
  ],
);

export const recipeSizes = mysqlTable(
  "recipe_sizes",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    recipeId: uuidColumn("recipe_id")
      .notNull()
      .references(() => recipes.id),
    name: varchar("name", { length: 100 }).notNull(),
    sellingPrice: decimal("selling_price", { precision: 12, scale: 2 }),
    outputQuantity: decimal("output_quantity", { precision: 14, scale: 3 }),
    sortOrder: int("sort_order").notNull().default(0),
  },
  (table) => [
    uniqueIndex("recipe_sizes_branch_id_uidx").on(table.branchId, table.id),
    scopedReference(
      "recipe_sizes_recipeId_br_fk",
      table.branchId,
      table.recipeId,
      (): AnyMySqlColumn => recipes.branchId,
      (): AnyMySqlColumn => recipes.id,
    ),
    uniqueIndex("recipe_sizes_recipe_name_uidx").on(
      table.branchId,
      table.recipeId,
      table.name,
    ),
    index("recipe_sizes_recipe_id_idx").on(table.recipeId),
  ],
);

export const recipeIngredients = mysqlTable(
  "recipe_ingredients",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    recipeSizeId: uuidColumn("recipe_size_id")
      .notNull()
      .references(() => recipeSizes.id),
    itemId: uuidColumn("item_id")
      .notNull()
      .references(() => items.id),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
  },
  (table) => [
    uniqueIndex("recipe_ingredients_branch_id_uidx").on(
      table.branchId,
      table.id,
    ),
    scopedReference(
      "recipe_ingredients_recipeSizeId_br_fk",
      table.branchId,
      table.recipeSizeId,
      (): AnyMySqlColumn => recipeSizes.branchId,
      (): AnyMySqlColumn => recipeSizes.id,
    ),
    scopedReference(
      "recipe_ingredients_itemId_br_fk",
      table.branchId,
      table.itemId,
      (): AnyMySqlColumn => items.branchId,
      (): AnyMySqlColumn => items.id,
    ),
    uniqueIndex("recipe_ingredients_size_item_uidx").on(
      table.branchId,
      table.recipeSizeId,
      table.itemId,
    ),
    index("recipe_ingredients_item_id_idx").on(table.itemId),
  ],
);

export const preparations = mysqlTable(
  "preparations",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    recipeId: uuidColumn("recipe_id")
      .notNull()
      .references(() => recipes.id),
    recipeName: varchar("recipe_name", { length: 191 }).notNull(),
    outputItemId: uuidColumn("output_item_id")
      .notNull()
      .references(() => items.id),
    outputItemName: varchar("output_item_name", { length: 191 }).notNull(),
    producedQuantity: decimal("produced_quantity", {
      precision: 14,
      scale: 3,
    }).notNull(),
    totalCost: decimal("total_cost", { precision: 30, scale: 2 }).notNull(),
    unitCost: decimal("unit_cost", { precision: 16, scale: 6 }).notNull(),
    outputBatchId: uuidColumn("output_batch_id").references(
      () => stockBatches.id,
    ),
    preparedBy: uuidColumn("prepared_by")
      .notNull()
      .references(() => users.id),
    notes: text("notes"),
    occurredAt: timestamp("occurred_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("preparations_branch_id_uidx").on(table.branchId, table.id),
    scopedReference(
      "preparations_recipeId_br_fk",
      table.branchId,
      table.recipeId,
      (): AnyMySqlColumn => recipes.branchId,
      (): AnyMySqlColumn => recipes.id,
    ),
    scopedReference(
      "preparations_outputItemId_br_fk",
      table.branchId,
      table.outputItemId,
      (): AnyMySqlColumn => items.branchId,
      (): AnyMySqlColumn => items.id,
    ),
    scopedReference(
      "preparations_outputBatchId_br_fk",
      table.branchId,
      table.outputBatchId,
      (): AnyMySqlColumn => stockBatches.branchId,
      (): AnyMySqlColumn => stockBatches.id,
    ),
    index("preparations_recipe_id_idx").on(table.recipeId),
    index("preparations_occurred_at_idx").on(table.occurredAt),
    uniqueIndex("preparations_output_batch_uidx").on(
      table.branchId,
      table.outputBatchId,
    ),
  ],
);

export const preparationAllocations = mysqlTable(
  "preparation_allocations",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    preparationId: uuidColumn("preparation_id")
      .notNull()
      .references(() => preparations.id),
    ingredientItemId: uuidColumn("ingredient_item_id")
      .notNull()
      .references(() => items.id),
    ingredientItemName: varchar("ingredient_item_name", {
      length: 191,
    }).notNull(),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
    unitCost: decimal("unit_cost", { precision: 16, scale: 6 }).notNull(),
    sourceBatchId: uuidColumn("source_batch_id").references(
      () => stockBatches.id,
    ),
  },
  (table) => [
    uniqueIndex("preparation_allocations_branch_id_uidx").on(
      table.branchId,
      table.id,
    ),
    scopedReference(
      "preparation_allocations_preparationId_br_fk",
      table.branchId,
      table.preparationId,
      (): AnyMySqlColumn => preparations.branchId,
      (): AnyMySqlColumn => preparations.id,
    ),
    scopedReference(
      "preparation_allocations_ingredientItemId_br_fk",
      table.branchId,
      table.ingredientItemId,
      (): AnyMySqlColumn => items.branchId,
      (): AnyMySqlColumn => items.id,
    ),
    scopedReference(
      "preparation_allocations_sourceBatchId_br_fk",
      table.branchId,
      table.sourceBatchId,
      (): AnyMySqlColumn => stockBatches.branchId,
      (): AnyMySqlColumn => stockBatches.id,
    ),
    index("preparation_allocations_preparation_idx").on(table.preparationId),
    index("preparation_allocations_item_idx").on(table.ingredientItemId),
  ],
);
