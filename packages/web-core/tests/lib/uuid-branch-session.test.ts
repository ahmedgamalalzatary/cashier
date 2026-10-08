import { afterEach, describe, expect, it, vi } from "vitest";
import {
  selectedBranchId,
  saveSelectedBranch,
} from "../../src/lib/branch-session";

afterEach(() => vi.unstubAllGlobals());
const admin = {
  id: "019a1234-5678-7000-8000-000000000101",
  name: "Admin",
  role: "admin" as const,
  isSuperAdmin: true,
};

describe("UUID branch selection", () => {
  it("does not invent a branch when no branch is saved", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null } });
    expect(selectedBranchId(admin)).toBeUndefined();
  });
  it("keeps a saved UUID intact and uses later selections unchanged", () => {
    const first = "019a1234-5678-7000-8000-000000000001";
    const second = "019a1234-5678-7000-8000-000000000002";
    const browser = Object.assign(new EventTarget(), {
      localStorage: { getItem: () => first, setItem: vi.fn() },
    });
    vi.stubGlobal("window", browser);
    expect(selectedBranchId(admin)).toBe(first);
    saveSelectedBranch(admin.id, second);
    expect(selectedBranchId(admin)).toBe(second);
  });
});
