import type {
  PurchaseInvoiceDetail,
  PurchaseInvoiceSummary,
  PurchaseUnitMode,
} from "@cashier/shared";
import { api } from "../lib/api";

export type PurchaseCreateBody = {
  supplierId: number;
  invoiceNumber: string | null;
  purchasedAt: string;
  paidAmount: number;
  notes: string | null;
  lines: Array<{
    itemId: number;
    quantity: number;
    unitMode: PurchaseUnitMode;
    unitPrice: number;
  }>;
};

export function listPurchases() {
  return api<PurchaseInvoiceSummary[]>("/api/purchases");
}

export function getPurchase(id: number) {
  return api<PurchaseInvoiceDetail>(`/api/purchases/${id}`);
}

export function createPurchase(body: PurchaseCreateBody) {
  return api<{ id: number }>("/api/purchases", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
