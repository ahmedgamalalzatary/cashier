import type { ManagedUser, Role } from "@cashier/shared";
import { api } from "@cashier/web-core/lib/api";

type IdResponse = { id: string };
type OkResponse = { ok: true };

export type UserSaveBody = {
  name?: string;
  username?: string;
  role?: Role;
  password?: string;
  isActive?: boolean;
};

export function listUsers() {
  return api<ManagedUser[]>("/api/users");
}

export function createUser(body: UserSaveBody) {
  return api<IdResponse>("/api/users", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateUser(id: string, body: UserSaveBody) {
  return api<OkResponse>(`/api/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function setUserActive(id: string, isActive: boolean) {
  return updateUser(id, { isActive });
}
