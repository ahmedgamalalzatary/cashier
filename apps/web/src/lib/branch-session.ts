import type { AuthUser } from "@cashier/shared";

export const BRANCH_CHANGED_EVENT = "cashier:branch-changed";
const keyFor = (userId: number) => `cashier.branch.${userId}`;
// Keep the current page's selection usable even if browser storage fails.
const pageSelections = new Map<number, number>();

export function selectedBranchId(user: AuthUser | undefined) {
  if (!user) return undefined;
  if (user.role === "cashier") return user.branchId ?? 1;
  const pageSelection = pageSelections.get(user.id);
  if (pageSelection !== undefined) return pageSelection;
  try {
    const value =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(keyFor(user.id));
    const id = value === null ? 1 : Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : 1;
  } catch {
    return 1;
  }
}

export function saveSelectedBranch(userId: number, branchId: number) {
  let current = pageSelections.get(userId);
  if (current === undefined) {
    try {
      current = Number(window.localStorage.getItem(keyFor(userId)));
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

export function subscribeToBranchChanges(userId: number, listener: () => void) {
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
