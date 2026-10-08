import { describe, expect, it } from "vitest";
import { loginInput } from "../../src/modules/auth/auth.schemas.js";

describe("explicit login role", () => {
  it.each(["admin", "cashier"])(
    "preserves the selected %s identity",
    (role) => {
      expect(
        loginInput.parse({ role, username: " ali ", password: "secret123" }),
      ).toEqual({ role, username: "ali", password: "secret123" });
    },
  );
  it.each([undefined, "manager"])(
    "rejects a missing or invalid role %s",
    (role) => {
      expect(
        loginInput.safeParse({ role, username: "ali", password: "secret123" })
          .success,
      ).toBe(false);
    },
  );
});
