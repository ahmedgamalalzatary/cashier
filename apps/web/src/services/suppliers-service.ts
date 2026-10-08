import type {
  Supplier,
  SupplierPayment,
  SupplierStatementMovement,
} from "@cashier/shared";
import { api } from "@cashier/web-core/lib/api";

type IdResponse = { id: string };
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

export function getSupplierStatement(id: string) {
  return api<{
    supplier: Supplier;
    payments: SupplierPayment[];
    movements: SupplierStatementMovement[];
  }>(`/api/suppliers/${id}/statement`);
}

export function createSupplier(body: SupplierSaveBody) {
  return api<IdResponse>("/api/suppliers", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateSupplier(id: string, body: SupplierSaveBody) {
  return api<OkResponse>(`/api/suppliers/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deactivateSupplier(id: string) {
  return api<OkResponse>(`/api/suppliers/${id}`, { method: "DELETE" });
}

export function reactivateSupplier(id: string) {
  return api<OkResponse>(`/api/suppliers/${id}`, {
    method: "PUT",
    body: JSON.stringify({ isActive: true }),
  });
}

export function recordSupplierPayment(id: string, body: SupplierPaymentBody) {
  return api<IdResponse>(`/api/suppliers/${id}/payments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
