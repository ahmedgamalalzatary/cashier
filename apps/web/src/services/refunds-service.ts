import type {
  RefundDetail,
  RefundStockAction,
  RefundSummary,
} from "@cashier/shared";
import { api } from "@cashier/web-core/lib/api";

export type CreateRefundBody = {
  clientRequestId: string;
  orderId: string;
  reason: string;
  lines: Array<{
    orderLineId: string;
    quantity: number;
    stockAction: RefundStockAction | null;
  }>;
};

export function listRefunds() {
  return api<RefundSummary[]>("/api/refunds");
}

export function getRefund(id: string) {
  return api<RefundDetail>(`/api/refunds/${id}`);
}

export function getRefundedQuantities(orderId: string) {
  return api<Array<{ orderLineId: string; refundedQuantity: string }>>(
    `/api/refunds/order/${orderId}/quantities`,
  );
}

export function createRefund(body: CreateRefundBody) {
  return api<RefundDetail>("/api/refunds", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
