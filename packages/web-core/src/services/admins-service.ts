import type { ManagedUser } from "@cashier/shared";
import { api } from "@cashier/web-core/lib/api";

export type AdminAccount = ManagedUser & { branchIds: string[] };

export const listAdmins = () => api<AdminAccount[]>("/api/admins");
export const createAdmin = (input: {
  name: string;
  username: string;
  password: string;
  branchIds: string[];
}) =>
  api<{ id: string }>("/api/admins", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const updateAdmin = (
  id: string,
  changes: {
    name?: string;
    username?: string;
    password?: string;
    isActive?: boolean;
    branchIds?: string[];
  },
) =>
  api<{ ok: true }>(`/api/admins/${id}`, {
    method: "PUT",
    body: JSON.stringify(changes),
  });
