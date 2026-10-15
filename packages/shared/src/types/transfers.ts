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
  /** Admin eyes only (§2): the response omits it for a cashier. */
  totalCost?: string;
  /** True when the transfer took main stock below zero. */
  isNegativeStock: boolean;
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
  /** Admin eyes only (§2): the response omits it for a cashier. */
  unitCost?: string;
  /** Admin eyes only (§2): the response omits it for a cashier. */
  lineCost?: string;
  /** Null when the line's shortfall took main stock below zero. */
  sourceBatchId: string | null;
  cafeBatchId: string;
};

export type TransferDetail = TransferSummary & {
  /** When the linked request was submitted; null for a direct transfer. */
  requestCreatedAt: string | null;
  /** When the linked request was approved; null for a direct transfer. */
  requestReviewedAt: string | null;
  lines: TransferLine[];
};
