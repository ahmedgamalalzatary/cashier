// API response shapes shared between apps/api and apps/web

export type Role = "admin" | "cashier";

export type AuthUser = {
  id: number;
  name: string;
  role: Role;
};

export type Session = {
  token: string;
  user: AuthUser;
};

export type ManagedUser = AuthUser & {
  username: string;
  isActive: boolean;
  /** ISO timestamp — Date on the server, serialized to string over JSON */
  createdAt: string;
};

export type Supplier = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  openingBalance: string;
  isActive: boolean;
  balance: string;
};

export type SupplierPayment = {
  id: number;
  supplierId: number;
  amount: string;
  paidAt: string;
  notes: string | null;
};

export type SupplierStatementMovement = {
  id: string;
  type: "purchase" | "payment";
  referenceId: number;
  date: string;
  description: string;
  /** Signed amount: purchases increase debt, payments reduce it. */
  amount: string;
  balanceAfter: string;
};

export type Category = {
  id: number;
  name: string;
  parentId: number | null;
  isActive: boolean;
  /** ISO timestamp — Date on the server, serialized to string over JSON */
  createdAt: string;
};

export const ITEM_TYPES = ["raw", "resale", "prepared"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export type Item = {
  id: number;
  name: string;
  categoryId: number;
  categoryName: string;
  type: ItemType;
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
  itemId: number;
  name: string;
  categoryId: number;
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

export type PurchaseUnitMode = "stock" | "purchase";

export type PurchaseInvoiceSummary = {
  id: number;
  supplierId: number;
  supplierName: string;
  invoiceNumber: string | null;
  purchasedAt: string;
  notes: string | null;
  totalAmount: string;
  paidAmount: string;
  dueAmount: string;
  createdBy: number;
  createdByName: string;
  /** ISO timestamp — Date on the server, serialized to string over JSON */
  createdAt: string;
};

export type PurchaseInvoiceLine = {
  id: number;
  itemId: number;
  itemName: string;
  quantity: string;
  unitMode: PurchaseUnitMode;
  unitName: string;
  stockQuantity: string;
  stockUnit: string;
  unitPrice: string;
  unitCost: string;
  lineTotal: string;
};

export type PurchaseInvoiceDetail = PurchaseInvoiceSummary & {
  lines: PurchaseInvoiceLine[];
};

export type TransferRequestStatus = "pending" | "approved" | "rejected";

export type TransferRequestSummary = {
  id: number;
  requestedBy: number;
  requestedByName: string;
  notes: string | null;
  status: TransferRequestStatus;
  reviewedBy: number | null;
  reviewedByName: string | null;
  rejectionReason: string | null;
  /** ISO timestamp, or null while pending. */
  reviewedAt: string | null;
  /** ISO timestamp. */
  createdAt: string;
  lineCount: number;
};

export type TransferRequestLine = {
  id: number;
  itemId: number;
  itemName: string;
  stockUnit: string;
  quantity: string;
};

export type TransferRequestDetail = Omit<TransferRequestSummary, "lineCount"> & {
  lines: TransferRequestLine[];
};

export type TransferSummary = {
  id: number;
  requestId: number | null;
  createdBy: number;
  createdByName: string;
  approvedBy: number;
  approvedByName: string;
  notes: string | null;
  totalCost: string;
  /** ISO timestamp. */
  createdAt: string;
};

export type TransferLine = {
  id: number;
  itemId: number;
  itemName: string;
  stockUnit: string;
  quantity: string;
  unitCost: string;
  lineCost: string;
  sourceBatchId: number;
  cafeBatchId: number;
};

export type TransferDetail = TransferSummary & {
  lines: TransferLine[];
};

export type RecipeType = "product" | "prepared";

export type RecipeIngredientCost = {
  id: number;
  itemId: number;
  itemName: string;
  itemType: ItemType;
  stockUnit: string;
  requiredQuantity: string;
  availableQuantity: string;
  currentCost: string | null;
  hasSufficientStock: boolean;
  itemIsActive: boolean;
};

type RecipeCommon = {
  id: number;
  name: string;
  categoryId: number;
  categoryName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductRecipeSize = {
  id: number;
  name: string;
  sellingPrice: string;
  currentCost: string | null;
  marginAmount: string | null;
  marginPercentage: string | null;
  costPercentage: string | null;
  hasSufficientStock: boolean;
  ingredients: RecipeIngredientCost[];
};

export type ProductRecipe = RecipeCommon & {
  type: "product";
  outputItemId: null;
  outputItemName: null;
  outputStockUnit: null;
  sizes: ProductRecipeSize[];
};

export type PreparedRecipe = RecipeCommon & {
  type: "prepared";
  outputItemId: number;
  outputItemName: string;
  outputStockUnit: string;
  baseYield: string;
  currentCost: string | null;
  estimatedUnitCost: string | null;
  hasSufficientStock: boolean;
  ingredients: RecipeIngredientCost[];
};

export type Recipe = ProductRecipe | PreparedRecipe;

export type PreparationSummary = {
  id: number;
  recipeId: number;
  recipeName: string;
  outputItemId: number;
  outputItemName: string;
  outputStockUnit: string;
  producedQuantity: string;
  totalCost: string;
  unitCost: string;
  outputBatchId: number;
  preparedBy: number;
  preparedByName: string;
  notes: string | null;
  occurredAt: string;
  createdAt: string;
};

export type PreparationAllocation = {
  id: number;
  ingredientItemId: number;
  ingredientItemName: string;
  stockUnit: string;
  quantity: string;
  unitCost: string;
  lineCost: string;
  sourceBatchId: number;
};

export type PreparationDetail = PreparationSummary & {
  allocations: PreparationAllocation[];
};
