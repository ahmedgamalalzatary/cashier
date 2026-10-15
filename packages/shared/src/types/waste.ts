export type WasteReason =
  "expired" | "damaged" | "preparation_mistake" | "spill" | "other";

export type WasteSummary = {
  id: string;
  shiftId: string | null;
  warehouse: "main" | "cafe";
  targetType: "item" | "recipe" | "external_product";
  targetName: string;
  sizeName: string | null;
  quantity: string;
  reason: WasteReason;
  note: string | null;
  /** Admin eyes only (§2): the response omits it for a cashier. */
  totalCost?: string;
  recordedBy: string;
  recordedByName: string;
  occurredAt: string;
};

export type WasteAllocation = {
  id: string;
  itemId: string;
  itemName: string;
  batchId: string | null;
  quantity: string;
  /** Admin eyes only (§2): the response omits it for a cashier. */
  unitCost?: string;
};

export type WasteDetail = WasteSummary & {
  allocations: WasteAllocation[];
};

export type WasteCatalog = {
  items: Array<{ id: string; name: string; stockUnit: string }>;
  products: Array<{
    externalProductId: number;
    externalSizeId: number | null;
    productName: string;
    sizeName: string | null;
  }>;
  recipes: Array<{
    recipeId: string;
    recipeSizeId: string;
    recipeName: string;
    sizeName: string | null;
  }>;
};
