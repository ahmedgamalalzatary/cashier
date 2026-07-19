import type { Item, ItemType } from "@cashier/shared";
import { api } from "../lib/api";

type IdResponse = { id: number };
type OkResponse = { ok: true };

export type ItemSaveBody = {
  name?: string;
  categoryId?: number;
  type?: ItemType;
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

export function updateItem(id: number, body: ItemSaveBody) {
  return api<OkResponse>(`/api/items/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deactivateItem(id: number) {
  return api<OkResponse>(`/api/items/${id}`, { method: "DELETE" });
}

export function reactivateItem(id: number) {
  return api<OkResponse>(`/api/items/${id}`, {
    method: "PUT",
    body: JSON.stringify({ isActive: true }),
  });
}
