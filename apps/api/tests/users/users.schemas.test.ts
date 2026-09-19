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
});
