import type { ItemType } from "./inventory.js";

export type RecipeType = "product" | "prepared";

export type RecipeIngredientCost = {
  id: string;
  itemId: string;
  itemCode: number;
  itemName: string;
  itemType: ItemType;
  stockUnit: string;
  requiredQuantity: string;
  availableQuantity: string;
  /** Null only when cafe and main stock together cannot cover the quantity. */
  currentCost: string | null;
  /** Where the cost came from: cafe FIFO first, then main for any shortfall. */
  costSource: "cafe" | "main" | "mixed" | null;
  /** Cafe stock alone covers the quantity (preparing consumes cafe stock). */
  hasSufficientStock: boolean;
  itemIsActive: boolean;
};

type RecipeCommon = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PreparedRecipe = RecipeCommon & {
  type: "prepared";
  outputItemId: string;
  outputItemName: string;
  outputStockUnit: string;
  baseYield: string;
  currentCost: string | null;
  estimatedUnitCost: string | null;
  hasSufficientStock: boolean;
  ingredients: RecipeIngredientCost[];
};

export type Recipe = PreparedRecipe;

export type PreparationSummary = {
  id: string;
  recipeId: string;
  recipeName: string;
  outputItemId: string;
  outputItemName: string;
  outputStockUnit: string;
  producedQuantity: string;
  totalCost: string;
  unitCost: string;
  outputBatchId: string;
  preparedBy: string;
  preparedByName: string;
  notes: string | null;
  occurredAt: string;
  createdAt: string;
  /** True when an ingredient was taken below zero by this preparation. */
  isNegativeStock: boolean;
};

export type PreparationAllocation = {
  id: string;
  ingredientItemId: string;
  ingredientItemCode: number;
  ingredientItemName: string;
  stockUnit: string;
  quantity: string;
  unitCost: string;
  lineCost: string;
  /** Null when the allocation's shortfall took cafe stock below zero. */
  sourceBatchId: string | null;
};

export type PreparationDetail = PreparationSummary & {
  allocations: PreparationAllocation[];
};
