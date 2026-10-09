import { describe, expect, it } from "vitest";
import {
  userInput,
  userUpdateInput,
} from "../../src/modules/users/users.schemas.js";

describe("user schemas", () => {
  it("only allows creating admin users with a strong password", () => {
    const parsed = userInput.parse({
      name: "مدير",
      username: "admin",
      role: "admin",
      password: "password-123",
    });
    expect(parsed.role).toBe("admin");

    expect(
      userInput.safeParse({
        name: "كاشير",
        username: "cashier",
        role: "cashier",
        password: "password-123",
      }).success,
    ).toBe(false);
    expect(
      userInput.safeParse({
        name: "مدير",
        username: "admin",
        role: "admin",
        password: "short",
      }).success,
    ).toBe(false);
    expect(
      userInput.safeParse({
        name: "   ",
        username: "admin",
        role: "admin",
        password: "password-123",
      }).success,
    ).toBe(false);
  });

  it("rejects empty updates but accepts single fields", () => {
    expect(userUpdateInput.safeParse({}).success).toBe(false);
    expect(
      userUpdateInput.safeParse({ password: "short" }).success,
    ).toBe(false);
    expect(userUpdateInput.parse({ name: "جديد" })).toEqual({
      name: "جديد",
    });
  });

  it("refuses a user password longer than bcrypt's 72 bytes", () => {
    const admin = {
      name: "مدير",
      username: "admin",
      role: "admin",
    } as const;

    expect(
      userInput.safeParse({ ...admin, password: "a".repeat(72) }).success,
    ).toBe(true);
    expect(
      userInput.safeParse({ ...admin, password: "a".repeat(73) }).success,
    ).toBe(false);
    expect(userUpdateInput.safeParse({ password: "a".repeat(73) }).success).toBe(
      false,
    );
    // an edit without a password is still fine
    expect(userUpdateInput.safeParse({ isActive: true }).success).toBe(true);
  });
});
