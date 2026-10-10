// API response shapes shared between apps/api and apps/web

/**
 * A shift left open for this long is closed by the system. The drawer was never
 * counted, so the close records the expected cash only and an admin enters the
 * counted cash later with the existing correction flow.
 */
export const MAX_SHIFT_HOURS = 16;

/**
 * A shift is warned about this many minutes before the system closes it: a
 * 16 hour shift starts warning at 15 hours.
 */
export const SHIFT_WARNING_MINUTES = 60;

export type Role = "admin" | "cashier";

export type AuthUser = {
  id: string;
  name: string;
  role: Role;
  /** Cashiers belong to one branch; admins can select any branch. */
  branchId?: string | null;
  /** Only the configured admin from server settings can manage admin accounts. */
  isSuperAdmin: boolean;
};

export type Branch = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
};

/** What online knows about the PC linked to a branch (desktop versions in use). */
export type DeviceStatus = {
  branchId: string;
  /** The desktop version the PC last reported; null until it first calls online. */
  appVersion: string | null;
  linkedAt: string;
  lastSeenAt: string | null;
  lastUploadAt: string | null;
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

export type CashierAccess = {
  userId: string;
  username: string;
  isActive: boolean;
};

export type Employee = {
  id: string;
  name: string;
  phone: string | null;
  jobTitle: string | null;
  hireDate: string | null;
  /** monthly salary — null means the salary was never set */
  payRate: string | null;
  notes: string | null;
  isActive: boolean;
  cashierAccess: CashierAccess | null;
  createdAt: string;
};

export type SalaryAdjustmentType = "bonus" | "deduction";
export type SalaryAdvance = {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: string;
  entryDate: string;
  note: string | null;
  recordedByName: string;
  createdAt: string;
};
export type SalaryAdjustment = SalaryAdvance & { type: SalaryAdjustmentType };
export type SalaryPayment = {
  id: string;
  employeeId: string;
  employeeName: string;
  periodMonth: string;
  basePay: string;
  bonuses: string;
  deductions: string;
  advances: string;
  netPay: string;
  paidByName: string;
  paidAt: string;
};
/** why a month row has no salary figure — null when the row is payable or paid */
export type SalaryBlockedReason = "no_salary" | "month_closed" | "invalid_data";
export type SalaryMonthEmployee = {
  employeeId: string;
  employeeName: string;
  isActive: boolean;
  /** monthly salary — null means the salary was never set */
  payRate: string | null;
  basePay: string | null;
  bonuses: string;
  deductions: string;
  advances: string;
  netPay: string | null;
  payment: SalaryPayment | null;
  blockedReason: SalaryBlockedReason | null;
  /** only for `invalid_data`: what exactly is broken */
  blockedMessage: string | null;
  /** months left unpaid before this one that this payment would lock for good */
  unpaidEarlierMonths: number;
};
export type SalaryMonth = {
  month: string;
  employees: SalaryMonthEmployee[];
  advances: SalaryAdvance[];
  adjustments: SalaryAdjustment[];
  payments: SalaryPayment[];
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
  | "open"
  | "close"
  | "admin_close"
  | "auto_close"
  | "reopen"
  | "correction";

export type ShiftEvent = {
  id: string;
  action: ShiftEventAction;
  actorUserId: string | null;
  note: string | null;
  openingFloat: string | null;
  actualCash: string | null;
  expectedCash: string | null;
  overShort: string | null;
  occurredAt: string;
};

export type Shift = {
  id: string;
  status: "open" | "closed";
  cashierUserId: string;
  employeeId: string;
  cashierName: string;
  openingFloat: string;
  openedAt: string;
  closedAt: string | null;
  closedByUserId: string | null;
  actualCash: string | null;
  expectedCash: string | null;
  overShort: string | null;
  workedMinutes: number;
  /** Current continuous open segment; absent on older API responses. */
  currentSegmentMinutes?: number;
  totals: ShiftTotals;
  events: ShiftEvent[];
};

export type CurrentShift = Shift;

export type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  openingBalance: string;
  isActive: boolean;
  balance: string;
};

export type SupplierPayment = {
  id: string;
  supplierId: string;
  amount: string;
  paidAt: string;
  notes: string | null;
};

export type SupplierStatementMovement = {
  id: string;
  type: "purchase" | "payment";
  referenceId: string;
  date: string;
  description: string;
  /** Signed amount: purchases increase debt, payments reduce it. */
  amount: string;
  balanceAfter: string;
};

export type Category = {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  /** ISO timestamp — Date on the server, serialized to string over JSON */
  createdAt: string;
};

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

export type PurchaseUnitMode = "stock" | "purchase";

export type PurchaseInvoiceSummary = {
  id: string;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string | null;
  purchasedAt: string;
  notes: string | null;
  totalAmount: string;
  paidAmount: string;
  dueAmount: string;
  createdBy: string;
  createdByName: string;
  /** ISO timestamp — Date on the server, serialized to string over JSON */
  createdAt: string;
};

export type PurchaseInvoiceLine = {
  id: string;
  itemId: string;
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
  /** of this line's stock quantity, already sent to the cafe */
  transferredToCafeQuantity: string;
};

export type PurchaseInvoiceTransferLink = {
  id: string;
  notes: string | null;
  /** ISO timestamp. */
  createdAt: string;
};

export type PurchaseInvoiceDetail = PurchaseInvoiceSummary & {
  lines: PurchaseInvoiceLine[];
  transfers: PurchaseInvoiceTransferLink[];
};

export type TransferRequestStatus = "pending" | "approved" | "rejected";

export type TransferRequestSummary = {
  id: string;
  requestedBy: string;
  shiftId: string | null;
  requestedByName: string;
  notes: string | null;
  status: TransferRequestStatus;
  reviewedBy: string | null;
  reviewedByName: string | null;
  rejectionReason: string | null;
  /** ISO timestamp, or null while pending. */
  reviewedAt: string | null;
  /** ISO timestamp. */
  createdAt: string;
  lineCount: number;
};

export type TransferRequestLine = {
  id: string;
  itemId: string;
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
  id: string;
  requestId: string | null;
  createdBy: string;
  createdByName: string;
  approvedBy: string;
  approvedByName: string;
  notes: string | null;
  totalCost: string;
  /** ISO timestamp. */
  createdAt: string;
};

export type TransferLine = {
  id: string;
  itemId: string;
  itemCode: number;
  itemName: string;
  stockUnit: string;
  quantity: string;
  unitCost: string;
  lineCost: string;
  sourceBatchId: string;
  cafeBatchId: string;
};

export type TransferDetail = TransferSummary & {
  lines: TransferLine[];
};

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
  currentCost: string | null;
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
  sourceBatchId: string;
};

export type PreparationDetail = PreparationSummary & {
  allocations: PreparationAllocation[];
};

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

export type OrderDiscountType = "percent" | "fixed";

export type OrderSummary = {
  id: string;
  orderNumber: string;
  cashierId: string;
  cashierName: string;
  shiftId: string | null;
  subtotal: string;
  discountType: OrderDiscountType | null;
  discountValue: string | null;
  discountAmount: string;
  total: string;
  cashReceived: string;
  changeAmount: string;
  totalCost: string;
  isNegativeStock: boolean;
  /** True when an admin completed the sale without an open shift. */
  isAdminSale: boolean;
  createdAt: string;
};

export type OrderLineAllocation = {
  id: string;
  itemId: string;
  itemCode: number;
  itemName: string;
  batchId: string | null;
  stockMovementId: string;
  quantity: string;
  unitCost: string;
  lineCost: string;
};

export type OrderLine = {
  id: string;
  type: "recipe" | "item" | "external_product";
  recipeId: string | null;
  recipeSizeId: string | null;
  itemId: string | null;
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
    id: string;
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
  id: string;
  orderId: string;
  orderNumber: string;
  shiftId: string | null;
  cashierId: string;
  cashierName: string;
  reason: string;
  amount: string;
  totalCostReturned: string;
  /** True when an admin issued the refund without an open shift. */
  isAdminRefund: boolean;
  createdAt: string;
};

export type RefundLine = {
  id: string;
  orderLineId: string;
  type: "recipe" | "item" | "external_product";
  itemCode: number | null;
  productName: string;
  sizeName: string | null;
  quantity: string;
  unitPrice: string;
  grossAmount: string;
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
  id: string;
  shiftId: string | null;
  warehouse: "main" | "cafe";
  targetType: "item" | "recipe" | "external_product";
  targetName: string;
  sizeName: string | null;
  quantity: string;
  reason: WasteReason;
  note: string | null;
  totalCost: string;
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
  unitCost: string;
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

export type ExpenseCategory = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
};

export type ExpenseSummary = {
  id: string;
  type: "shift" | "general";
  categoryId: string;
  categoryName: string;
  shiftId: string | null;
  amount: string;
  expenseDate: string;
  note: string | null;
  recordedBy: string;
  recordedByName: string;
  createdAt: string;
};
