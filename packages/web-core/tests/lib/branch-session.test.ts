import { testId } from "@cashier/shared/test-support";
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
        id: failure === "read" ? testId(101) : testId(102),
        name: "Admin",
        role: "admin",
        isSuperAdmin: false,
      };
      const browser = Object.assign(new EventTarget(), {
        localStorage: {
          getItem: () => {
            if (failure === "read") throw new Error("Storage unavailable");
            return testId(1);
          },
          setItem: () => {
            if (failure === "write") throw new Error("Storage full");
          },
        },
      });
      vi.stubGlobal("window", browser);
      const observed: string[] = [];
      const unsubscribe = subscribeToBranchChanges(user.id, () => {
        observed.push(selectedBranchId(user)!);
      });

      try {
        expect(() => saveSelectedBranch(user.id, testId(7))).not.toThrow();
        expect(selectedBranchId(user)).toBe(testId(7));
        saveSelectedBranch(user.id, testId(7));
        expect(observed).toEqual([testId(7)]);
      } finally {
        unsubscribe();
      }
    },
  );

  it("keeps an already saved branch unchanged without notifying", () => {
    const browser = Object.assign(new EventTarget(), {
      localStorage: {
        getItem: () => testId(7),
        setItem: () => {
          throw new Error("An unchanged branch must not be written");
        },
      },
    });
    vi.stubGlobal("window", browser);
    let notifications = 0;
    browser.addEventListener(BRANCH_CHANGED_EVENT, () => notifications++);

    saveSelectedBranch(testId(103), testId(7));
    expect(notifications).toBe(0);
  });

  it("adopts a cross-tab branch change after a failed local save", () => {
    const user: AuthUser = {
      id: testId(104),
      name: "Admin",
      role: "admin",
      isSuperAdmin: false,
    };
    let stored = testId(1);
    const browser = Object.assign(new EventTarget(), {
      localStorage: {
        getItem: () => stored,
        setItem: () => {
          throw new Error("Storage full");
        },
      },
    });
    vi.stubGlobal("window", browser);
    saveSelectedBranch(user.id, testId(7));
    const observed: string[] = [];
    const unsubscribe = subscribeToBranchChanges(user.id, () => {
      observed.push(selectedBranchId(user)!);
    });

    try {
      stored = testId(9);
      browser.dispatchEvent(
        Object.assign(new Event("storage"), { key: `cashier.branch.${user.id}` }),
      );
      expect(observed).toEqual([testId(9)]);
    } finally {
      unsubscribe();
    }
  });
});
