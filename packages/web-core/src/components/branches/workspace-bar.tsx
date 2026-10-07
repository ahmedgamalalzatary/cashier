"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { useAuth } from "../auth/auth-provider";
import { useBranch } from "./branch-provider";

export function WorkspaceBar() {
  const { user } = useAuth();
  const { branch, branches, selectBranch } = useBranch();
  return (
    <div className="print:hidden mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
      <div className="flex min-w-0 items-center gap-3">
        <Building2
          className="size-5 shrink-0 text-primary"
          aria-hidden="true"
        />
        {user?.role === "admin" ? (
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">الفرع الحالي</span>
            <select
              aria-label="الفرع الحالي"
              value={branch.id}
              onChange={(event) => selectBranch(Number(event.target.value))}
              className="max-w-full rounded-lg border border-line bg-surface px-3 py-2 font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {branches.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                  {row.isActive ? "" : " (مؤرشف)"}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <strong className="truncate">{branch.name}</strong>
        )}
      </div>
      {user?.role === "admin" && (
        <Link
          href="/branches"
          className="text-sm font-medium text-primary hover:underline"
        >
          إدارة الفروع
        </Link>
      )}
      {!branch.isActive && (
        <p
          role="status"
          className="w-full rounded-lg bg-accent/15 px-3 py-2 text-sm"
        >
          الفرع مؤرشف؛ السجلات متاحة للقراءة. أعد تفعيله لتسجيل الحركات.
        </p>
      )}
    </div>
  );
}
