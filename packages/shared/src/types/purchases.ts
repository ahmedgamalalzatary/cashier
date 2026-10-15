export type PurchaseUnitMode = "stock" | "purchase";

export type PurchaseInvoiceStatus = "paid" | "partial" | "credit";

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
  /** Of this invoice's total, covered by payments recorded after purchase. */
  coveredAmount: string;
  /** What is still owed on this invoice; the badge follows it. */
  remainingAmount: string;
  status: PurchaseInvoiceStatus;
  createdBy: string;
  createdByName: string;
  /** A line of this invoice still owes stock to the cafe (can open a transfer). */
  hasStockToTransfer: boolean;
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
  /** The supplier's live balance; the payment action shows only while it is > 0. */
  supplierBalance: string;
  lines: PurchaseInvoiceLine[];
  transfers: PurchaseInvoiceTransferLink[];
};

/** Money figures of an invoice journey, as DECIMAL(…,2) strings. */
export type InvoiceJourneyMoney = {
  /** Stock cost the invoice brought in. */
  boughtCost: string;
  /** Cost of what is still sold (refunds already taken out). */
  soldCost: string;
  /** This invoice's cost share of the price customers paid. */
  salesAmount: string;
  refundedAmount: string;
  /** salesAmount − refundedAmount − soldCost */
  profit: string;
  /** Waste plus refunds that could not go back to stock. */
  wastedCost: string;
  shortageCost: string;
  mainStockCost: string;
  cafeStockCost: string;
  /** Still in stock inside prepared items. */
  preparedStockCost: string;
};

/** Quantities are in the invoice item's stock unit, as DECIMAL(…,3) strings. */
export type InvoiceJourneyLine = InvoiceJourneyMoney & {
  itemId: string;
  itemCode: number;
  itemName: string;
  stockUnit: string;
  boughtQuantity: string;
  soldQuantity: string;
  wastedQuantity: string;
  shortageQuantity: string;
  mainStockQuantity: string;
  cafeStockQuantity: string;
  preparedStockQuantity: string;
  /** Cafe sales of this item (any invoice) still waiting to be matched to stock. */
  unmatchedSaleQuantity: string;
};

export type InvoiceJourneyProduct = {
  itemId: string;
  productName: string;
  sizeName: string | null;
  /** The prepared item the ingredient was sold inside, if any. */
  viaItemName: string | null;
  /** In the invoice item's stock unit. */
  quantity: string;
  cost: string;
  salesAmount: string;
  refundedAmount: string;
  profit: string;
};

export type PurchaseInvoiceJourney = {
  invoiceId: string;
  totals: InvoiceJourneyMoney;
  lines: InvoiceJourneyLine[];
  products: InvoiceJourneyProduct[];
};
