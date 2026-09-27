"use client";

import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Branch } from "@cashier/shared";
import { useAuth } from "../auth/auth-provider";
import {
  selectedBranchId,
  saveSelectedBranch,
  subscribeToBranchChanges,
} from "../../lib/branch-session";
import { listBranches } from "../../services/branches-service";
import { Button } from "../ui/button";

type Scope = { ownerId: number; branches: Branch[]; selectedId: number };
type BranchContextValue = {
  branch: Branch;
  branches: Branch[];
  selectBranch(id: number): void;
  refresh(): Promise<void>;
};
const Context = createContext<BranchContextValue | null>(null);

export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const [scope, setScope] = useState<Scope | null>(null);
  const [error, setError] = useState<{
    ownerId: number;
    message: string;
  } | null>(null);
  const sequence = useRef(0);
  const invalidateRequests = useCallback(() => {
    sequence.current++;
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    const version = ++sequence.current;
    try {
      const rows = await listBranches();
      if (version !== sequence.current) return;
      const preferred = selectedBranchId(user);
      const selected =
        user.role === "cashier"
          ? rows.find((row) => row.id === preferred && row.isActive)
          : (rows.find((row) => row.id === preferred) ??
            rows.find((row) => row.isActive) ??
            rows[0]);
      if (!selected) throw new Error("لا يوجد فرع متاح لهذا الحساب");
      saveSelectedBranch(user.id, selected.id);
      setScope({ ownerId: user.id, branches: rows, selectedId: selected.id });
      setError(null);
    } catch (cause) {
      if (version !== sequence.current) return;
      setError({
        ownerId: user.id,
        message: cause instanceof Error ? cause.message : "تعذر تحميل الفروع",
      });
      throw cause;
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const initialLoad = window.setTimeout(
      () => void refresh().catch(() => undefined),
      0,
    );
    const unsubscribe = subscribeToBranchChanges(user.id, () => {
      const selected = selectedBranchId(user);
      setScope((previous) => {
        if (previous?.ownerId !== user.id || selected === undefined)
          return previous;
        return { ...previous, selectedId: selected };
      });
      // Discover branches created in another tab before exposing their pages.
      void refresh().catch(() => undefined);
    });
    return () => {
      window.clearTimeout(initialLoad);
      invalidateRequests();
      unsubscribe();
    };
  }, [user, refresh, invalidateRequests]);

  if (!user) return children;
  const branch =
    scope?.ownerId === user.id && scope.selectedId === selectedBranchId(user)
      ? scope.branches.find((row) => row.id === scope.selectedId)
      : undefined;
  if (!branch || !scope) {
    const message = error?.ownerId === user.id ? error.message : null;
    return (
      <div className="grid min-h-screen place-items-center bg-paper p-6">
        {message ? (
          <div className="space-y-4 text-center">
            <p role="alert" className="text-danger">
              {message}
            </p>
            <Button onClick={() => void refresh().catch(() => undefined)}>
              إعادة المحاولة
            </Button>
          </div>
        ) : (
          <p role="status" className="text-muted">
            جارٍ تحميل الفرع…
          </p>
        )}
      </div>
    );
  }
  const selectBranch = (id: number) => {
    if (
      user.role !== "admin" ||
      id === scope.selectedId ||
      !scope.branches.some((row) => row.id === id)
    )
      return;
    saveSelectedBranch(user.id, id);
    setScope({ ...scope, selectedId: id });
    router.replace("/");
  };
  return (
    <Context.Provider
      value={{ branch, branches: scope.branches, selectBranch, refresh }}
    >
      {/* Switching workspaces resets forms, carts, and in-flight page state. */}
      <Fragment key={`${user.id}:${branch.id}`}>{children}</Fragment>
    </Context.Provider>
  );
}

export function useBranch() {
  const value = useContext(Context);
  if (!value) throw new Error("BranchProvider is required");
  return value;
}
