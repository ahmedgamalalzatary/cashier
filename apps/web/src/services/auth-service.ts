import type { Session } from "@cashier/shared";
import { api } from "../lib/api";
import { writeSession } from "../lib/auth";

type ChangePasswordDependencies = {
  request: typeof api;
  persist: typeof writeSession;
};

const changePasswordDependencies: ChangePasswordDependencies = {
  request: api,
  persist: writeSession,
};

export function login(username: string, password: string) {
  return api<Session>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function changePasswordAndRefreshSession(
  currentPassword: string,
  newPassword: string,
  { request, persist } = changePasswordDependencies,
) {
  const session = await request<Session>("/api/auth/password", {
    method: "PUT",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  persist(session);
  return session;
}
