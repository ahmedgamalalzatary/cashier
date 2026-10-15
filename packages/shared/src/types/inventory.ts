export const ITEM_TYPES = ["raw", "resale", "prepared"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export type Item = {
  id: string;
  /** system-assigned sequential code; display with formatItemCode */
  code: number;
  name: string;
  categoryId: string;
  categoryName: string;
  type: ItemType;
  sellingPrice: string | null;
  stockUnit: string;
  purchaseUnit: string | null;
  purchaseToStockFactor: string | null;
  mainMinimumLevel: string;
  cafeMinimumLevel: string;
  hasStockHistory: boolean;
  isActive: boolean;
  /** ISO timestamp — Date on the server, serialized to string over JSON */
  createdAt: string;
};

export const WAREHOUSES = ["main", "cafe"] as const;
export type Warehouse = (typeof WAREHOUSES)[number];

export type InventoryStockRow = {
  itemId: string;
  code: number;
  name: string;
  categoryId: string;
  categoryName: string;
  type: ItemType;
  stockUnit: string;
  isActive: boolean;
  quantity: string;
  stockValue: string;
  minimumLevel: string;
  isLowStock: boolean;
  isNegativeStock: boolean;
};

export type StocktakeStatus = "draft" | "confirmed";
export type StocktakeKind = "stocktake" | "manual";
export type StocktakeLine = {
  id: string;
  itemId: string;
  itemCode: number;
  itemName: string;
  stockUnit: string;
  recordedQuantity: string;
  countedQuantity: string | null;
  difference: string | null;
};
export type StocktakeSummary = {
  id: string;
  kind: StocktakeKind;
  warehouse: Warehouse;
  categoryId: string | null;
  status: StocktakeStatus;
  note: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  confirmedAt: string | null;
  lineCount: number;
};
export type StocktakeDetail = Omit<StocktakeSummary, "lineCount"> & {
  lines: StocktakeLine[];
};
