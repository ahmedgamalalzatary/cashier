import type { Category } from "@cashier/shared";
import { api } from "../lib/api";

type IdResponse = { id: number };
type OkResponse = { ok: true };

export type CategoryCreateBody = {
  name: string;
  parentId: number | null;
};

export type CategoryUpdateBody = {
  name?: string;
  parentId?: number | null;
  isActive?: true;
};

export function listCategories() {
  return api<Category[]>("/api/categories");
}

export function createCategory(body: CategoryCreateBody) {
  return api<IdResponse>("/api/categories", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateCategory(id: number, body: CategoryUpdateBody) {
  return api<OkResponse>(`/api/categories/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deactivateCategory(id: number) {
  return api<OkResponse>(`/api/categories/${id}`, { method: "DELETE" });
}

export function reactivateCategory(id: number) {
  return api<OkResponse>(`/api/categories/${id}`, {
    method: "PUT",
    body: JSON.stringify({ isActive: true }),
  });
}
