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
  colors?: CategoryOption[];
  sizes?: CategoryOption[];
};

export type CategoryOption = {
  id: number;
  categoryId: number;
  name: string;
  isActive: boolean;
  createdAt: string;
};

export type ProductVariant = {
  id: number;
  code: number;
  barcode: string | null;
  colorId: number;
  colorName: string;
  sizeId: number;
  sizeName: string;
  sellingPrice: string;
  mainMinimumLevel: string;
  shopMinimumLevel: string;
  hasStockHistory: boolean;
  isActive: boolean;
};

export type Item = {
  id: number;
  name: string;
  categoryId: number;
  categoryName: string;
  variants: ProductVariant[];
  isActive: boolean;
  /** ISO timestamp — Date on the server, serialized to string over JSON */
  createdAt: string;
};

export const WAREHOUSES = ["main", "shop"] as const;
export type Warehouse = (typeof WAREHOUSES)[number];

export type InventoryStockRow = {
  variantId?: number;
  itemId: number;
  code: number;
  barcode?: string | null;
  productName?: string;
  name: string;
  colorName?: string;
  sizeName?: string;
  categoryId: number;
  categoryName: string;
  type: string;
  stockUnit: string;
  isActive: boolean;
  quantity: string;
  stockValue: string;
  minimumLevel: string;
  isLowStock: boolean;
  isNegativeStock: boolean;
};

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
  variantId?: number;
  variantCode?: number;
  itemId: number;
  itemCode: number;
  itemName: string;
  barcode?: string | null;
  productName?: string;
  colorName?: string;
  sizeName?: string;
  quantity: string;
  unitMode?: "stock" | "purchase";
  unitName?: string;
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
  shopBatchId: number;
};

export type TransferDetail = TransferSummary & {
  lines: TransferLine[];
};

type PosCatalogBase = {
  productName: string;
  categoryId: number;
  mainCategoryId: number;
  mainCategoryName: string;
  subCategoryId: number | null;
  subCategoryName: string | null;
};

export type PosCatalogProduct = PosCatalogBase & {
  variantId: number;
  productId: number;
  code: number;
  barcode: string | null;
  colorId: number;
  colorName: string;
  sizeId: number;
  sizeName: string;
  sellingPrice: string;
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
  variantId: number;
  variantCode: number;
  variantName: string;
  batchId: number | null;
  stockMovementId: number;
  quantity: string;
  unitCost: string;
  lineCost: string;
};

export type OrderLine = {
  id: number;
  variantId: number;
  productName: string;
  colorName: string;
  sizeName: string;
  variantCode: number;
  barcode: string | null;
  quantity: string;
  unitPrice: string;
  lineSubtotal: string;
  totalCost: string;
  hasStockDeficit: boolean;
  allocations: OrderLineAllocation[];
};

export type OrderDetail = OrderSummary & {
  lines: OrderLine[];
};
