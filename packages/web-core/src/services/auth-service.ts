import type { AuthUser, Role, Session } from "@cashier/shared";
import { api } from "@cashier/web-core/lib/api";

export function login(username: string, password: string, role: Role) {
  return api<Session>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password, role }),
  });
}

export function logout() {
  return api<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export function currentUser() {
  return api<AuthUser>("/api/auth/me");
}
