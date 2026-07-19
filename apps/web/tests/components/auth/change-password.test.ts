import { describe, expect, it, vi } from "vitest";
import type { Session } from "@cashier/shared";
import { changePasswordAndRefreshSession } from "../../../src/components/auth/change-password";

describe("changePasswordAndRefreshSession", () => {
  it("persists the fresh session returned by the API", async () => {
    const session: Session = {
      token: "fresh-token",
      user: { id: 1, name: "Admin", role: "admin" },
    };
    const request = vi.fn().mockResolvedValue(session);
    const persist = vi.fn();

    await expect(
      changePasswordAndRefreshSession("old-secret", "new-secret", {
        request,
        persist,
      }),
    ).resolves.toEqual(session);
    expect(request).toHaveBeenCalledWith("/api/auth/password", {
      method: "PUT",
      body: JSON.stringify({
        currentPassword: "old-secret",
        newPassword: "new-secret",
      }),
    });
    expect(persist).toHaveBeenCalledWith(session);
  });
});
