import { describe, expect, it } from "vitest";
import { loginInput } from "../../src/modules/auth/auth.schemas.js";

describe("auth schemas", () => {
  it("accepts credentials and trims the username", () => {
    expect(
      loginInput.parse({
        role: "admin",
        username: "  مدير  ",
        password: "secret123",
      }),
    ).toEqual({ role: "admin", username: "مدير", password: "secret123" });
  });

  it("rejects blank, over-long, and missing credentials", () => {
    expect(
      loginInput.safeParse({
        role: "admin",
        username: "   ",
        password: "secret123",
      }).success,
    ).toBe(false);
    expect(
      loginInput.safeParse({
        role: "admin",
        username: "x".repeat(101),
        password: "s",
      }).success,
    ).toBe(false);
    expect(
      loginInput.safeParse({ role: "admin", username: "admin", password: "" })
        .success,
    ).toBe(false);
  });
});
