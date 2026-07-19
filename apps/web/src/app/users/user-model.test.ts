import { describe, expect, it } from "vitest";
import { userRequestBody } from "./user-model";

const form = {
  name: "  كاشير مسائي  ",
  username: "  evening  ",
  role: "cashier" as const,
  password: "",
};

describe("user form model", () => {
  it("omits an empty password while editing an account", () => {
    expect(userRequestBody(form, true)).toEqual({
      name: "كاشير مسائي",
      username: "evening",
      role: "cashier",
    });
  });

  it("includes the required password when creating an account", () => {
    expect(userRequestBody({ ...form, password: "secret-456" }, false)).toEqual(
      {
        name: "كاشير مسائي",
        username: "evening",
        role: "cashier",
        password: "secret-456",
      },
    );
  });
});
