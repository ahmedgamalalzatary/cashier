export type OrderDiscountType = "percent" | "fixed";

export type RefundStatus = "none" | "partial" | "full";

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
  /** Admin eyes only (§2): the response omits it for a cashier. */
  totalCost?: string;
  isNegativeStock: boolean;
  /** True when an admin completed the sale without an open shift. */
  isAdminSale: boolean;
  /** Cash that came back through refunds of this order. */
  refundedAmount: string;
  refundStatus: RefundStatus;
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
  unitCost?: string;
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
  /** Admin eyes only (§2): the response omits it for a cashier. */
  totalCost?: string;
  hasStockDeficit: boolean;
  /** Of this line's sold quantity, what refunds brought back. */
  refundedQuantity: string;
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

/** One refund document linked to an order, as the order page lists it. */
export type OrderRefundLink = {
  id: string;
  amount: string;
  createdAt: string;
};

export type OrderDetail = OrderSummary & {
  lines: OrderLine[];
  refunds: OrderRefundLink[];
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
