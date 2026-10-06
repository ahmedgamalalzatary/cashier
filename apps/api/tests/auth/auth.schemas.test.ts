import { describe, expect, it } from "vitest";
import { loginInput } from "../../src/modules/auth/auth.schemas.js";

describe("auth schemas", () => {
  it("accepts credentials and trims the username", () => {
    expect(
      loginInput.parse({ username: "  مدير  ", password: "secret123" }),
    ).toEqual({ username: "مدير", password: "secret123" });
  });

  it("rejects blank, over-long, and missing credentials", () => {
    expect(
      loginInput.safeParse({ username: "   ", password: "secret123" }).success,
    ).toBe(false);
    expect(
      loginInput.safeParse({ username: "x".repeat(101), password: "s" })
        .success,
    ).toBe(false);
    expect(
      loginInput.safeParse({ username: "admin", password: "" }).success,
    ).toBe(false);
  });
});
