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

  it("still accepts a long password so accounts set before the byte limit keep working", () => {
    // bcrypt only ever used the first 72 bytes of these, and sign-in compares
    // the same way, so refusing long input here would lock people out of
    // accounts that were created before passwords were capped.
    const legacy = "a".repeat(73);

    expect(loginInput.parse({ role: "admin", username: "admin", password: legacy }))
      .toEqual({ role: "admin", username: "admin", password: legacy });
  });
});
