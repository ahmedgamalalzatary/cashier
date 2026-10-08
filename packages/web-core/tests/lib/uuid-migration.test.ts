import { afterEach, describe, expect, it, vi } from "vitest";
import { readSession, SESSION_KEY } from "../../src/lib/auth";
import { selectedBranchId } from "../../src/lib/branch-session";

afterEach(() => vi.unstubAllGlobals());
const admin = {
  id: "019a1234-5678-7000-8000-000000000201",
  name: "Admin",
  role: "admin" as const,
  isSuperAdmin: false,
};

describe("UUID browser state", () => {
  it.each([null, "7", "invalid"])(
    "leaves missing or invalid branch %s unselected",
    (stored) => {
      vi.stubGlobal("window", { localStorage: { getItem: () => stored } });
      expect(selectedBranchId(admin)).toBeUndefined();
    },
  );

  it("preserves a stored UUID branch", () => {
    vi.stubGlobal("window", {
      localStorage: { getItem: () => "019a1234-5678-7000-8000-000000000202" },
    });
    expect(selectedBranchId(admin)).toBe(
      "019a1234-5678-7000-8000-000000000202",
    );
  });

  it("does not invent a branch for an incomplete cashier profile", () => {
    expect(selectedBranchId({ ...admin, role: "cashier" })).toBeUndefined();
  });

  it("ignores a counter branch left in a cashier profile", () => {
    const user = JSON.parse(
      JSON.stringify({ ...admin, role: "cashier", branchId: 7 }),
    );
    expect(selectedBranchId(user)).toBeUndefined();
  });

  it.each(["7", "broken"])(
    "removes an unexpired session with invalid user ID %s",
    (id) => {
      const storage = new Map([
        [
          SESSION_KEY,
          JSON.stringify({
            user: { ...admin, id },
            exp: Math.floor(Date.now() / 1000) + 60,
          }),
        ],
      ]);
      vi.stubGlobal("window", {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          removeItem: (key: string) => storage.delete(key),
        },
      });
      expect(readSession()).toBeNull();
      expect(storage.has(SESSION_KEY)).toBe(false);
    },
  );

  it("treats inaccessible session storage as signed out", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("Storage unavailable");
        },
        removeItem: () => {
          throw new Error("Storage unavailable");
        },
      },
    });
    expect(readSession()).toBeNull();
  });

  it("removes an unexpired counter-ID session from before the schema reset", () => {
    const storage = new Map([
      [
        SESSION_KEY,
        JSON.stringify({
          user: { ...admin, id: 7 },
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
      ],
    ]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => storage.delete(key),
      },
    });
    expect(readSession()).toBeNull();
    expect(storage.has(SESSION_KEY)).toBe(false);
  });
});
