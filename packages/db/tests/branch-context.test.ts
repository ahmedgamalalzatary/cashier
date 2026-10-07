import { describe, expect, it } from "vitest";
import {
  currentBranchId,
  withBranch,
  branchValues,
} from "../src/branch-context.js";

describe("explicit branch scope", () => {
  it("rejects an operation without a selected branch", () => {
    expect(() => currentBranchId()).toThrow("Branch scope is required");
  });

  it("uses the selected UUID for inserted branch rows", () => {
    const branch = "019a1234-5678-7000-8000-000000000001";
    expect(withBranch(branch, () => branchValues({ name: "Local" }))).toEqual({
      name: "Local",
      branchId: branch,
    });
  });
});
