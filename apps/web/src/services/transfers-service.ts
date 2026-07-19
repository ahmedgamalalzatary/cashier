import type {
  TransferDetail,
  TransferRequestDetail,
  TransferRequestSummary,
  TransferSummary,
} from "@cashier/shared";
import { api } from "../lib/api";

export type TransferLineBody = { itemId: number; quantity: number };
export type TransferRequestBody = {
  notes: string | null;
  lines: TransferLineBody[];
};

export function listTransferRequests() {
  return api<TransferRequestSummary[]>("/api/transfers/requests");
}

export function getTransferRequest(id: number) {
  return api<TransferRequestDetail>(`/api/transfers/requests/${id}`);
}

export function createTransferRequest(body: TransferRequestBody) {
  return api<{ id: number }>("/api/transfers/requests", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function approveTransferRequest(id: number, lines: TransferLineBody[]) {
  return api<{ transferId: number }>(`/api/transfers/requests/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ lines }),
  });
}

export function rejectTransferRequest(id: number, reason: string) {
  return api<{ ok: true }>(`/api/transfers/requests/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function listTransfers() {
  return api<TransferSummary[]>("/api/transfers");
}

export function getTransfer(id: number) {
  return api<TransferDetail>(`/api/transfers/${id}`);
}

export function createDirectTransfer(body: TransferRequestBody) {
  return api<{ transferId: number }>("/api/transfers/direct", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
