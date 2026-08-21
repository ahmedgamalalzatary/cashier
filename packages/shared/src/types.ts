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

export type EmployeePayType = "monthly" | "daily" | "hourly";

export type CashierAccess = {
  userId: number;
  username: string;
  isActive: boolean;
};

export type Employee = {
  id: number;
  name: string;
  phone: string | null;
  jobTitle: string | null;
  hireDate: string | null;
  payType: EmployeePayType | null;
  payRate: string | null;
  notes: string | null;
  isActive: boolean;
  cashierAccess: CashierAccess | null;
  createdAt: string;
};

export type ShiftTotals = {
  ordersCount: number;
  sales: string;
  discounts: string;
  transferRequests: number;
  refunds: string;
  expenses: string;
  wasteEntries: number;
};

export type ShiftEventAction =
  "open" | "close" | "admin_close" | "reopen" | "correction";

export type ShiftEvent = {
  id: number;
  action: ShiftEventAction;
  actorUserId: number;
  note: string | null;
  openingFloat: string | null;
  actualCash: string | null;
  expectedCash: string | null;
  overShort: string | null;
  occurredAt: string;
};

export type Shift = {
  id: number;
  status: "open" | "closed";
  cashierUserId: number;
  employeeId: number;
  cashierName: string;
  openingFloat: string;
  openedAt: string;
  closedAt: string | null;
  closedByUserId: number | null;
  actualCash: string | null;
  expectedCash: string | null;
  overShort: string | null;
  workedMinutes: number;
  totals: ShiftTotals;
  events: ShiftEvent[];
};

export type CurrentShift = Shift | { occupied: true };

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
  /** system-assigned sequential code; display with formatItemCode */
  code: number;
  name: string;
  categoryId: number;
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
  itemId: number;
  code: number;
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
  itemCode: number;
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
  shiftId: number | null;
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
  itemCode: number;
  itemName: string;
  stockUnit: string;
  quantity: string;
};

export type TransferRequestDetail = Omit<
  TransferRequestSummary,
  "lineCount"
> & {
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
  itemCode: number;
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

export type RecipeType = "prepared";

export type RecipeIngredientCost = {
  id: number;
  itemId: number;
  itemCode: number;
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

export type Recipe = PreparedRecipe;

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
  ingredientItemCode: number;
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

export type ExternalIngredientMapping = {
  itemId: number;
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

export type ExternalCacheRefreshStatus = {
  lastAttemptAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastFailedAt: string | null;
  lastError: string | null;
  refreshRequestedAt: string | null;
  refreshing: boolean;
};

export type ProductStockSetupBody = {
  baseIngredients: Array<{ itemId: number; quantity: number }>;
  sizes: Array<{
    externalSizeId: number;
    ingredients: Array<{ itemId: number; quantity: number }>;
  }>;
  modifiers: Array<
    | { externalModifierOptionId: number; stockEffect: "none" }
    | {
        externalModifierOptionId: number;
        stockEffect: "mapped";
        ingredients: Array<{ itemId: number; quantity: number }>;
      }
  >;
};

export type OrderDiscountType = "percent" | "fixed";

export type OrderSummary = {
  id: number;
  orderNumber: string;
  cashierId: number;
  cashierName: string;
  shiftId: number | null;
  subtotal: string;
  discountType: OrderDiscountType | null;
  discountValue: string | null;
  discountAmount: string;
  total: string;
  cashReceived: string;
  changeAmount: string;
  totalCost: string;
  isNegativeStock: boolean;
  createdAt: string;
};

export type OrderLineAllocation = {
  id: number;
  itemId: number;
  itemCode: number;
  itemName: string;
  batchId: number | null;
  stockMovementId: number;
  quantity: string;
  unitCost: string;
  lineCost: string;
};

export type OrderLine = {
  id: number;
  type: "recipe" | "item" | "external_product";
  recipeId: number | null;
  recipeSizeId: number | null;
  itemId: number | null;
  externalProductId: number | null;
  externalSizeId: number | null;
  productName: string;
  sizeName: string | null;
  quantity: string;
  unitPrice: string;
  lineSubtotal: string;
  totalCost: string;
  hasStockDeficit: boolean;
  modifiers: Array<{
    id: number;
    externalModifierGroupId: number;
    externalModifierOptionId: number;
    groupName: string;
    optionName: string;
    quantity: number;
    unitExtraPrice: string;
  }>;
  allocations: OrderLineAllocation[];
};

export type OrderDetail = OrderSummary & {
  lines: OrderLine[];
};

export type ExternalOrderStatus =
  "pending" | "completed" | "cancelled" | "unknown";
export type ExternalPaymentStatus =
  "pending" | "paid" | "failed" | "cancelled" | "unpaid" | "unknown";
export type ExternalPaymentMethod =
  "cash_on_delivery" | "online" | "onsite" | "unknown";
export type ExternalOrderType = "pickup" | "delivery" | "unknown";

export type ExternalOrderSummary = {
  id: number;
  customerName: string;
  customerPhone: string | null;
  subtotal: string;
  discountAmount: string;
  totalAmount: string;
  deliveryFee: string;
  createdAt: string;
  orderStatus: ExternalOrderStatus;
  paymentStatus: ExternalPaymentStatus;
  paymentMethod: ExternalPaymentMethod;
  orderType: ExternalOrderType;
  itemCount: number;
};

export type ExternalOrdersPage = {
  data: ExternalOrderSummary[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  totals: {
    count: number;
    sales: string;
    discounts: string;
    pending: number;
  };
};

export type RefundStockAction = "return_to_stock" | "not_returnable";

export type RefundSummary = {
  id: number;
  orderId: number;
  orderNumber: string;
  shiftId: number;
  cashierId: number;
  cashierName: string;
  reason: string;
  amount: string;
  totalCostReturned: string;
  createdAt: string;
};

export type RefundLine = {
  id: number;
  orderLineId: number;
  type: "recipe" | "item" | "external_product";
  itemCode: number | null;
  productName: string;
  sizeName: string | null;
  quantity: string;
  unitPrice: string;
  refundAmount: string;
  stockAction: RefundStockAction | null;
  returnedCost: string;
};

export type RefundDetail = RefundSummary & {
  lines: RefundLine[];
};

export type WasteReason =
  "expired" | "damaged" | "preparation_mistake" | "spill" | "other";

export type WasteSummary = {
  id: number;
  shiftId: number | null;
  warehouse: "main" | "cafe";
  targetType: "item" | "recipe" | "external_product";
  targetName: string;
  sizeName: string | null;
  quantity: string;
  reason: WasteReason;
  note: string | null;
  totalCost: string;
  recordedBy: number;
  recordedByName: string;
  occurredAt: string;
};

export type WasteAllocation = {
  id: number;
  itemId: number;
  itemName: string;
  batchId: number | null;
  quantity: string;
  unitCost: string;
};

export type WasteDetail = WasteSummary & {
  allocations: WasteAllocation[];
};

export type WasteCatalog = {
  items: Array<{ id: number; name: string; stockUnit: string }>;
  products: Array<{
    externalProductId: number;
    externalSizeId: number | null;
    productName: string;
    sizeName: string | null;
  }>;
};

export type ExpenseCategory = {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: string;
};

export type ExpenseSummary = {
  id: number;
  type: "shift" | "general";
  categoryId: number;
  categoryName: string;
  shiftId: number | null;
  amount: string;
  expenseDate: string;
  note: string | null;
  recordedBy: number;
  recordedByName: string;
  createdAt: string;
};
