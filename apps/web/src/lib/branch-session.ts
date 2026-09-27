import type { AuthUser } from "@cashier/shared";

export const BRANCH_CHANGED_EVENT = "cashier:branch-changed";
const keyFor = (userId: number) => `cashier.branch.${userId}`;

export function selectedBranchId(user: AuthUser | undefined) {
  if (!user) return undefined;
  if (user.role === "cashier") return user.branchId ?? 1;
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
  if (window.localStorage.getItem(keyFor(userId)) === String(branchId)) return;
  window.localStorage.setItem(keyFor(userId), String(branchId));
  window.dispatchEvent(new Event(BRANCH_CHANGED_EVENT));
}

export function subscribeToBranchChanges(userId: number, listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === keyFor(userId) || event.key === null) listener();
  };
  window.addEventListener(BRANCH_CHANGED_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(BRANCH_CHANGED_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
