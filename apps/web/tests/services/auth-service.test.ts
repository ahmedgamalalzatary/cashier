import { describe, expect, it, vi } from "vitest";
import { api } from "../../src/lib/api";
import { login } from "../../src/services/auth-service";

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
