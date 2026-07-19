import { describe, expect, it, vi } from "vitest";
import type { Session } from "@cashier/shared";
import { api } from "../../src/lib/api";
import {
  changePasswordAndRefreshSession,
  login,
} from "../../src/services/auth-service";

vi.mock("../../src/lib/api", () => ({ api: vi.fn() }));

describe("login", () => {
  it("posts credentials to the auth endpoint", async () => {
    vi.mocked(api).mockResolvedValue(undefined as never);
    await login("admin", "secret-123");
    expect(api).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "admin", password: "secret-123" }),
    });
  });
});

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
