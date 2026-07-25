import { describe, expect, it } from "vitest";
import { userRequestBody } from "../../src/models/user-model";

const form = {
  name: "  كاشير مسائي  ",
  username: "  evening  ",
  role: "admin" as const,
  password: "",
};

describe("user form model", () => {
  it("omits an empty password while editing an account", () => {
    expect(userRequestBody(form, true)).toEqual({
      name: "كاشير مسائي",
      username: "evening",
    });
  });

  it("includes the required password when creating an account", () => {
    expect(
      userRequestBody(
        { ...form, role: "admin", password: "secret-456" },
        false,
      ),
    ).toEqual({
      name: "كاشير مسائي",
      username: "evening",
      role: "admin",
      password: "secret-456",
    });
  });

  it("preserves leading and trailing spaces in passwords", () => {
    expect(
      userRequestBody({ ...form, password: "  exact secret  " }, false),
    ).toMatchObject({ password: "  exact secret  " });
  });
});
