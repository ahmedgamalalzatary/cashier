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
  /** Admin eyes only (§2): the response omits it for a cashier. */
  totalCostReturned?: string;
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
  /** Admin eyes only (§2): the response omits it for a cashier. */
  returnedCost?: string;
};

export type RefundDetail = RefundSummary & {
  lines: RefundLine[];
};
