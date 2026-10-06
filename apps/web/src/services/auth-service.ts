import type { Session } from "@cashier/shared";
import { api } from "../lib/api";

export function login(username: string, password: string) {
  return api<Session>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function logout() {
  return api<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}
