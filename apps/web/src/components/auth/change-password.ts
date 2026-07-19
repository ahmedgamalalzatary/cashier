import type { Session } from "@cashier/shared";
import { api } from "../../lib/api";
import { writeSession } from "../../lib/auth";

type Dependencies = {
  request: typeof api;
  persist: typeof writeSession;
};

const dependencies: Dependencies = { request: api, persist: writeSession };

export async function changePasswordAndRefreshSession(
  currentPassword: string,
  newPassword: string,
  { request, persist } = dependencies,
) {
  const session = await request<Session>("/api/auth/password", {
    method: "PUT",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  persist(session);
  return session;
}
