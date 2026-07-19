import type { ManagedUser, Role } from "@cashier/shared";
import { api } from "../lib/api";

type IdResponse = { id: number };
type OkResponse = { ok: true };

export type UserSaveBody = {
  name?: string;
  username?: string;
  role?: Role;
  password?: string;
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

export function updateUser(id: number, body: UserSaveBody) {
  return api<OkResponse>(`/api/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function setUserActive(id: number, isActive: boolean) {
  return api<OkResponse>(`/api/users/${id}`, {
    method: "PUT",
    body: JSON.stringify({ isActive }),
  });
}
