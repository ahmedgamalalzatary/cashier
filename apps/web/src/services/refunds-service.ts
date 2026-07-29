import type {
  RefundDetail,
  RefundStockAction,
  RefundSummary,
} from "@cashier/shared";
import { api } from "../lib/api";

export type CreateRefundBody = {
  clientRequestId: string;
  orderId: number;
  reason: string;
  lines: Array<{
    orderLineId: number;
    quantity: number;
    stockAction: RefundStockAction | null;
  }>;
};

export function listRefunds() {
  return api<RefundSummary[]>("/api/refunds");
}

export function getRefund(id: number) {
  return api<RefundDetail>(`/api/refunds/${id}`);
}

export function getRefundedQuantities(orderId: number) {
  return api<Array<{ orderLineId: number; refundedQuantity: string }>>(
    `/api/refunds/order/${orderId}/quantities`,
  );
}

export function createRefund(body: CreateRefundBody) {
  return api<RefundDetail>("/api/refunds", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
