import type { AuthUser } from "@cashier/shared";
import { isUuid } from "./uuid";

export const BRANCH_CHANGED_EVENT = "cashier:branch-changed";
const keyFor = (userId: string) => `cashier.branch.${userId}`;
// Keep the current page's selection usable even if browser storage fails.
const pageSelections = new Map<string, string>();

export function selectedBranchId(user: AuthUser | undefined) {
  if (!user) return undefined;
  if (user.role === "cashier")
    return isUuid(user.branchId) ? user.branchId : undefined;
  const pageSelection = pageSelections.get(user.id);
  if (pageSelection !== undefined) return pageSelection;
  try {
    const value =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(keyFor(user.id));
    return isUuid(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function saveSelectedBranch(userId: string, branchId: string) {
  let current = pageSelections.get(userId);
  if (current === undefined) {
    try {
      current = window.localStorage.getItem(keyFor(userId)) ?? undefined;
    } catch {
      // The in-memory selection below still enables workspace changes.
    }
  }
  if (current === branchId) return;
  try {
    window.localStorage.setItem(keyFor(userId), String(branchId));
  } catch {
    // Persistence is optional; requests must still use the selected workspace.
  }
  pageSelections.set(userId, branchId);
  window.dispatchEvent(new Event(BRANCH_CHANGED_EVENT));
}

export function subscribeToBranchChanges(userId: string, listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === keyFor(userId) || event.key === null) {
      pageSelections.delete(userId);
      listener();
    }
  };
  window.addEventListener(BRANCH_CHANGED_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(BRANCH_CHANGED_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
