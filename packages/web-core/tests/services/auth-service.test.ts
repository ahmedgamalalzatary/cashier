import { describe, expect, it, vi } from "vitest";
import { api } from "../../src/lib/api";
import { login } from "../../src/services/auth-service";

vi.mock("../../src/lib/api", () => ({ api: vi.fn() }));

describe("login", () => {
  it.each(["admin", "cashier"] as const)(
    "posts credentials with the chosen %s role",
    async (role) => {
      vi.mocked(api).mockResolvedValue(undefined as never);
      await login("ali", "secret-123", role);
      expect(api).toHaveBeenCalledWith("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: "ali", password: "secret-123", role }),
      });
    },
  );
});
