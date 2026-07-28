import type { Item } from "@cashier/shared";
import { api } from "../lib/api";

export type VariantSaveBody = {
  id?: number;
  colorId: number;
  sizeId: number;
  barcode?: string | null;
  sellingPrice: number;
  isActive?: boolean;
};
export type ItemSaveBody = {
  name?: string;
  categoryId?: number;
  variants?: VariantSaveBody[];
  isActive?: true;
};
export function listItems() {
  return api<Item[]>("/api/items");
}
export function createItem(body: ItemSaveBody) {
  return api<{ id: number }>("/api/items", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
export function updateItem(id: number, body: ItemSaveBody) {
  return api<{ ok: true }>(`/api/items/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
export function deactivateItem(id: number) {
  return api<{ ok: true }>(`/api/items/${id}`, { method: "DELETE" });
}
export function reactivateItem(id: number) {
  return updateItem(id, { isActive: true });
}
