import { describe, expect, it } from "vitest";
import { passwordTooLongMessage } from "../../src/lib/password";

describe("the password limit shown on screen", () => {
  it("says nothing for a password bcrypt will use in full", () => {
    expect(passwordTooLongMessage("a".repeat(72))).toBe("");
    expect(passwordTooLongMessage("ا".repeat(36))).toBe("");
  });

  it("explains the limit for a longer password, counted in bytes", () => {
    // 37 Arabic characters are only 37 long, but 74 bytes
    expect(passwordTooLongMessage("ا".repeat(37))).toMatch(/72/);
    expect(passwordTooLongMessage("a".repeat(73))).toMatch(/72/);
  });
});