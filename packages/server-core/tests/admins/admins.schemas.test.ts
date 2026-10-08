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
