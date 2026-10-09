import { testId } from "@cashier/shared/test-support";
import { describe, expect, it } from "vitest";
import {
  adminBranchesInput,
  adminInput,
  adminUpdateInput,
} from "../../src/modules/admins/admins.schemas.js";

const newAdmin = {
  name: "مدير جديد",
  username: "new-admin",
  password: "password-123",
};

describe("admin request bodies", () => {
  it("creates an admin without the client naming the role", () => {
    // The online screen sends no role: every account made here is an admin.
    expect(adminInput.safeParse(newAdmin).success).toBe(true);
  });

  it("lists a branch picked twice only once", () => {
    const twice = [testId(20), testId(20), testId(21)];

    expect(adminInput.parse({ ...newAdmin, branchIds: twice }).branchIds)
      .toEqual([testId(20), testId(21)]);
    expect(adminUpdateInput.parse({ branchIds: twice }).branchIds).toEqual([
      testId(20),
      testId(21),
    ]);
    expect(adminBranchesInput.parse({ branchIds: twice }).branchIds).toEqual([
      testId(20),
      testId(21),
    ]);
  });

  it("rejects a branch that is not an id", () => {
    expect(
      adminInput.safeParse({ ...newAdmin, branchIds: ["north"] }).success,
    ).toBe(false);
    expect(adminUpdateInput.safeParse({ branchIds: ["north"] }).success).toBe(
      false,
    );
  });
});

describe("admin passwords and bcrypt's 72-byte limit", () => {
  // bcrypt hashes only the first 72 bytes, so a longer password and one that
  // shares those 72 bytes would both sign in.
  const ascii = (bytes: number) => "a".repeat(bytes);
  // Arabic letters are two UTF-8 bytes each, so 36 of them are 72 bytes.
  const arabic = (letters: number) => "ا".repeat(letters);

  it("accepts a password of exactly 72 bytes", () => {
    expect(
      adminInput.safeParse({ ...newAdmin, password: ascii(72) }).success,
    ).toBe(true);
    expect(
      adminUpdateInput.safeParse({ password: ascii(72) }).success,
    ).toBe(true);
  });

  it("rejects a password longer than 72 bytes", () => {
    for (const tooLong of [ascii(73), arabic(37)])
      expect(
        adminInput.safeParse({ ...newAdmin, password: tooLong }).success,
      ).toBe(false);
    expect(adminUpdateInput.safeParse({ password: ascii(73) }).success).toBe(
      false,
    );
  });

  it("counts bytes, not characters, so Arabic and emoji stop sooner", () => {
    expect(
      adminInput.safeParse({ ...newAdmin, password: arabic(36) }).success,
    ).toBe(true);
    expect(
      adminInput.safeParse({ ...newAdmin, password: "😀".repeat(18) }).success,
    ).toBe(true);
    expect(
      adminInput.safeParse({ ...newAdmin, password: "😀".repeat(19) }).success,
    ).toBe(false);
  });

  it("explains the limit in a message the person can act on", () => {
    const parsed = adminInput.safeParse({ ...newAdmin, password: ascii(73) });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].message).toMatch(/72/);
  });

  it("still allows an edit that carries no password", () => {
    expect(adminUpdateInput.safeParse({ isActive: false }).success).toBe(true);
  });
});
