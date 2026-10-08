import type { Category } from "@cashier/shared";
import { api } from "@cashier/web-core/lib/api";

type IdResponse = { id: string };
type OkResponse = { ok: true };

export type CategoryCreateBody = {
  name: string;
  parentId: string | null;
};

export type CategoryUpdateBody = {
  name?: string;
  parentId?: string | null;
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

export function updateCategory(id: string, body: CategoryUpdateBody) {
  return api<OkResponse>(`/api/categories/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deactivateCategory(id: string) {
  return api<OkResponse>(`/api/categories/${id}`, { method: "DELETE" });
}

export function reactivateCategory(id: string) {
  return api<OkResponse>(`/api/categories/${id}`, {
    method: "PUT",
    body: JSON.stringify({ isActive: true }),
  });
}
