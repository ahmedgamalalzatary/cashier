import type { Item, ItemType } from "@cashier/shared";
import { api } from "@cashier/web-core/lib/api";

type IdResponse = { id: string };
type OkResponse = { ok: true };

export type ItemSaveBody = {
  name?: string;
  categoryId?: string;
  type?: ItemType;
  sellingPrice?: number | null;
  stockUnit?: string;
  purchaseUnit?: string | null;
  purchaseToStockFactor?: number | null;
  mainMinimumLevel?: number;
  cafeMinimumLevel?: number;
};

export function listItems() {
  return api<Item[]>("/api/items");
}

export function createItem(body: ItemSaveBody) {
  return api<IdResponse>("/api/items", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateItem(id: string, body: ItemSaveBody) {
  return api<OkResponse>(`/api/items/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deactivateItem(id: string) {
  return api<OkResponse>(`/api/items/${id}`, { method: "DELETE" });
}

export function reactivateItem(id: string) {
  return api<OkResponse>(`/api/items/${id}`, {
    method: "PUT",
    body: JSON.stringify({ isActive: true }),
  });
}
