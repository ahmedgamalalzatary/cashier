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
} from "@cashier/web-core/lib/branch-session";
import { listBranches } from "../../services/branches-service";
import { Button } from "../ui/button";

type Scope = {
  ownerId: string;
  branches: Branch[];
  selectedId: string | null;
  /**
   * Another tab selected a workspace this tab has not seen in a finished
   * load. Until the list catches up there is no single truthful branch, so
   * branch-scoped content waits rather than showing one workspace while
   * requests go to another.
   */
  pending: boolean;
};
type BranchContextValue = {
  /** The selected branch, or null while the account has none to choose from. */
  branch: Branch | null;
  branches: Branch[];
  /** Why the list could not be loaded, or null when it loaded. */
  error: string | null;
  selectBranch(id: string): void;
  refresh(): Promise<void>;
};
const Context = createContext<BranchContextValue | null>(null);

export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const [scope, setScope] = useState<Scope | null>(null);
  const [error, setError] = useState<{
    ownerId: string;
    message: string;
  } | null>(null);
  const sequence = useRef(0);
  const invalidateRequests = useCallback(() => {
    sequence.current++;
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    const version = ++sequence.current;
    setError((previous) => (previous?.ownerId === user.id ? null : previous));
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
      // An empty list is a real answer: a new online site has no branch yet,
      // and its super-admin has to be able to reach the page that adds one.
      if (selected) saveSelectedBranch(user.id, selected.id);
      setScope({
        ownerId: user.id,
        branches: rows,
        selectedId: selected?.id ?? null,
        pending: false,
      });
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
        if (previous?.ownerId !== user.id) return previous;
        if (selected === undefined) return previous;
        if (previous.branches.some((row) => row.id === selected))
          return { ...previous, selectedId: selected, pending: false };
        // The selected workspace is not in the list this tab already has. If
        // it is simply newer than the list, the refresh will confirm it and
        // the answer must wait; if it no longer exists, the list wins and the
        // refresh picks a workspace this account really has.
        return { ...previous, selectedId: null, pending: true };
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
  const message = error?.ownerId === user.id ? error.message : null;
  // Empty lists and failed initial loads keep the global management pages
  // reachable. An unresolved cross-tab selection has its own recovery view.
  const loaded = scope?.ownerId === user.id;
  if (!loaded && !message) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper p-6">
        <p role="status" className="text-muted">
          جارٍ تحميل الفرع…
        </p>
      </div>
    );
  }
  const branches = loaded ? scope.branches : [];
  const branch = loaded
    ? (branches.find((row) => row.id === scope.selectedId) ?? null)
    : null;
  // Until the requested and displayed branches agree, descendants wait.
  // Their retry controls are hidden too, so recovery must live here.
  const suspended = loaded && scope.pending;
  const selectBranch = (id: string) => {
    if (
      user.role !== "admin" ||
      !loaded ||
      id === scope.selectedId ||
      !branches.some((row) => row.id === id)
    )
      return;
    saveSelectedBranch(user.id, id);
    setScope({ ...scope, selectedId: id });
    router.replace("/");
  };
  return (
    <Context.Provider
      value={{ branch, branches, error: message, selectBranch, refresh }}
    >
      {/* Switching workspaces resets forms, carts, and in-flight page state. */}
      <Fragment key={`${user.id}:${scope?.selectedId ?? "none"}`}>
        {suspended ? (
          message ? (
            <div role="alert" className="space-y-3 p-6">
              <p className="text-danger">{message}</p>
              <Button onClick={() => void refresh().catch(() => undefined)}>
                إعادة المحاولة
              </Button>
            </div>
          ) : (
            <p role="status" className="p-6 text-muted">
              جارٍ تحميل الفرع…
            </p>
          )
        ) : (
          children
        )}
      </Fragment>
    </Context.Provider>
  );
}

export function useBranch() {
  const value = useContext(Context);
  if (!value) throw new Error("BranchProvider is required");
  return value;
}
