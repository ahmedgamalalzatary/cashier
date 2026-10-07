import type { Branch } from "@cashier/shared";
import { api } from "@cashier/web-core/lib/api";

export const listBranches = () => api<Branch[]>("/api/branches");
export const createBranch = (name: string) =>
  api<Branch>("/api/branches", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
export const updateBranch = (
  id: number,
  changes: { name?: string; isActive?: boolean },
) =>
  api<Branch>(`/api/branches/${id}`, {
    method: "PUT",
    body: JSON.stringify(changes),
  });
export const archiveBranch = (id: number) =>
  api<Branch>(`/api/branches/${id}`, { method: "DELETE" });
