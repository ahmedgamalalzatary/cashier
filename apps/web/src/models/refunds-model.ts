import type { RefundStockAction } from "@cashier/shared";

export type RefundDraftLine = {
  quantity: number;
  stockAction: RefundStockAction | null;
  refundedQuantity: number;
};

const emptyDraftEntry: RefundDraftLine = {
  quantity: 0,
  stockAction: null,
  refundedQuantity: 0,
};

export function refundDraftEntry(
  draft: Record<number, RefundDraftLine>,
  lineId: number,
): RefundDraftLine {
  return draft[lineId] ?? emptyDraftEntry;
}
