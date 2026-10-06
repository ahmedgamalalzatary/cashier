import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@cashier/shared";
import {
  BRANCH_CHANGED_EVENT,
  saveSelectedBranch,
  selectedBranchId,
  subscribeToBranchChanges,
} from "../../src/lib/branch-session";

afterEach(() => vi.unstubAllGlobals());

describe("branch selection", () => {
  it.each(["read", "write"])(
    "retains the selected workspace and notifies once when storage %s fails",
    (failure) => {
      const user: AuthUser = {
        id: failure === "read" ? 101 : 102,
        name: "Admin",
        role: "admin",
        isSuperAdmin: false,
      };
      const browser = Object.assign(new EventTarget(), {
        localStorage: {
          getItem: () => {
            if (failure === "read") throw new Error("Storage unavailable");
            return "1";
          },
          setItem: () => {
            if (failure === "write") throw new Error("Storage full");
          },
        },
      });
      vi.stubGlobal("window", browser);
      const observed: number[] = [];
      const unsubscribe = subscribeToBranchChanges(user.id, () => {
        observed.push(selectedBranchId(user)!);
      });

      try {
        expect(() => saveSelectedBranch(user.id, 7)).not.toThrow();
        expect(selectedBranchId(user)).toBe(7);
        saveSelectedBranch(user.id, 7);
        expect(observed).toEqual([7]);
      } finally {
        unsubscribe();
      }
    },
  );

  it("keeps an already saved branch unchanged without notifying", () => {
    const browser = Object.assign(new EventTarget(), {
      localStorage: {
        getItem: () => "7",
        setItem: () => {
          throw new Error("An unchanged branch must not be written");
        },
      },
    });
    vi.stubGlobal("window", browser);
    let notifications = 0;
    browser.addEventListener(BRANCH_CHANGED_EVENT, () => notifications++);

    saveSelectedBranch(103, 7);
    expect(notifications).toBe(0);
  });

  it("adopts a cross-tab branch change after a failed local save", () => {
    const user: AuthUser = {
      id: 104,
      name: "Admin",
      role: "admin",
      isSuperAdmin: false,
    };
    let stored = "1";
    const browser = Object.assign(new EventTarget(), {
      localStorage: {
        getItem: () => stored,
        setItem: () => {
          throw new Error("Storage full");
        },
      },
    });
    vi.stubGlobal("window", browser);
    saveSelectedBranch(user.id, 7);
    const observed: number[] = [];
    const unsubscribe = subscribeToBranchChanges(user.id, () => {
      observed.push(selectedBranchId(user)!);
    });

    try {
      stored = "9";
      browser.dispatchEvent(
        Object.assign(new Event("storage"), { key: "cashier.branch.104" }),
      );
      expect(observed).toEqual([9]);
    } finally {
      unsubscribe();
    }
  });
});
