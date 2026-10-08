import type {
  PurchaseInvoiceDetail,
  PurchaseInvoiceSummary,
  PurchaseUnitMode,
} from "@cashier/shared";
import { api } from "@cashier/web-core/lib/api";

export type PurchaseCreateBody = {
  clientRequestId: string;
  supplierId: string;
  invoiceNumber: string | null;
  purchasedAt: string;
  paidAmount: number;
  notes: string | null;
  lines: Array<{
    itemId: string;
    quantity: number;
    unitMode: PurchaseUnitMode;
    unitPrice: number;
    toCafeQuantity: number;
  }>;
};

export function listPurchases() {
  return api<PurchaseInvoiceSummary[]>("/api/purchases");
}

export function getPurchase(id: string) {
  return api<PurchaseInvoiceDetail>(`/api/purchases/${id}`);
}

export function createPurchase(body: PurchaseCreateBody) {
  return api<{ id: string }>("/api/purchases", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
