import type {
  TransferDetail,
  TransferRequestDetail,
  TransferRequestSummary,
  TransferSummary,
} from "@cashier/shared";
import { api } from "@cashier/web-core/lib/api";

export type TransferLineBody = { itemId: string; quantity: number };
export type TransferRequestBody = {
  clientRequestId: string;
  notes: string | null;
  lines: TransferLineBody[];
};

export type TransferDirectBody = {
  notes: string | null;
  /** set when the transfer moves stock bought by that invoice */
  purchaseInvoiceId?: string;
  lines: TransferLineBody[];
};

export function listTransferRequests() {
  return api<TransferRequestSummary[]>("/api/transfers/requests");
}

export function getTransferRequest(id: string) {
  return api<TransferRequestDetail>(`/api/transfers/requests/${id}`);
}

export function createTransferRequest(body: TransferRequestBody) {
  return api<{ id: string }>("/api/transfers/requests", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function approveTransferRequest(id: string, lines: TransferLineBody[]) {
  return api<{ transferId: string }>(`/api/transfers/requests/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ lines }),
  });
}

export function rejectTransferRequest(id: string, reason: string) {
  return api<{ ok: true }>(`/api/transfers/requests/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function listTransfers() {
  return api<TransferSummary[]>("/api/transfers");
}

export function getTransfer(id: string) {
  return api<TransferDetail>(`/api/transfers/${id}`);
}

export function createDirectTransfer(body: TransferDirectBody) {
  return api<{ transferId: string }>("/api/transfers/direct", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
