import type { Supplier, SupplierPayment } from "@cashier/shared";
import { api } from "../lib/api";

type IdResponse = { id: number };
type OkResponse = { ok: true };

export type SupplierSaveBody = {
  name: string;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  openingBalance?: number;
};

export type SupplierPaymentBody = {
  amount: number;
  paidAt: string;
  notes: string | null;
};

export function listSuppliers() {
  return api<Supplier[]>("/api/suppliers");
}

export function getSupplierStatement(id: number) {
  return api<{ supplier: Supplier; payments: SupplierPayment[] }>(
    `/api/suppliers/${id}/statement`,
  );
}

export function createSupplier(body: SupplierSaveBody) {
  return api<IdResponse>("/api/suppliers", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateSupplier(id: number, body: SupplierSaveBody) {
  return api<OkResponse>(`/api/suppliers/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deactivateSupplier(id: number) {
  return api<OkResponse>(`/api/suppliers/${id}`, { method: "DELETE" });
}

export function reactivateSupplier(id: number) {
  return api<OkResponse>(`/api/suppliers/${id}`, {
    method: "PUT",
    body: JSON.stringify({ isActive: true }),
  });
}

export function recordSupplierPayment(id: number, body: SupplierPaymentBody) {
  return api<IdResponse>(`/api/suppliers/${id}/payments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
