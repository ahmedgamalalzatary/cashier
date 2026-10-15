import type { Category } from "./suppliers.js";

export type ExternalIngredientMapping = {
  itemId: string;
  quantity: string;
};

export type ExternalProductSize = {
  externalId: number;
  nameAr: string;
  nameEn: string;
  price: string;
  isDefault: boolean;
  ingredients: ExternalIngredientMapping[];
};

export type ExternalModifierOption = {
  externalId: number;
  // Null when the external catalog has lost the name. Such a product is
  // cached and configurable but never sellable.
  nameAr: string | null;
  nameEn: string | null;
  extraPrice: string;
  stockEffect: "incomplete" | "mapped" | "none";
  ingredients: ExternalIngredientMapping[];
};

export type ExternalModifierGroup = {
  externalId: number;
  nameAr: string | null;
  nameEn: string | null;
  isRequired: boolean;
  maxSelections: number;
  options: ExternalModifierOption[];
};

export type ExternalProduct = {
  externalId: number;
  externalCategoryId: number;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  imageUrl: string | null;
  price: string;
  discountPercentage: string | null;
  discountStart: string | null;
  discountEnd: string | null;
  calories: number;
  pointsReward: number;
  isAvailable: boolean;
  isVisible: boolean;
  ingredients: ExternalIngredientMapping[];
  sizes: ExternalProductSize[];
  modifierGroups: ExternalModifierGroup[];
  stockConfigured: boolean;
  modifierNamesMissing: boolean;
  sellable: boolean;
};

export type ExternalCategory = {
  externalId: number;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  isActive: boolean;
  isVisible: boolean;
  displayOrder: number;
};

export type ExternalProductCatalog = {
  categories: ExternalCategory[];
  products: ExternalProduct[];
  lastSuccessfulSyncAt: string | null;
  stale: boolean;
  syncError: string | null;
};

export type LocalSaleProduct = {
  id: string;
  name: string;
  categoryId: string;
  sellingPrice: string;
  stockUnit: string;
};

export type PosCatalog = ExternalProductCatalog & {
  localCategories: Array<Pick<Category, "id" | "name" | "parentId">>;
  localProducts: LocalSaleProduct[];
};

export type ExternalCacheRefreshStatus = {
  lastAttemptAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastFailedAt: string | null;
  lastError: string | null;
  refreshRequestedAt: string | null;
  refreshing: boolean;
};

export type ProductStockSetupBody = {
  baseIngredients: Array<{ itemId: string; quantity: number }>;
  sizes: Array<{
    externalSizeId: number;
    ingredients: Array<{ itemId: string; quantity: number }>;
  }>;
  modifiers: Array<
    | { externalModifierOptionId: number; stockEffect: "none" }
    | {
        externalModifierOptionId: number;
        stockEffect: "mapped";
        ingredients: Array<{ itemId: string; quantity: number }>;
      }
  >;
};
