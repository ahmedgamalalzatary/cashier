"use client";

import { Building2 } from "lucide-react";
import { useBranch } from "@cashier/web-core/components/branches/branch-provider";

// online-api returns only the branches this admin may read, so the shared
// provider's list is already scoped and the picker just presents it.
export function BranchPicker() {
  const { branch, branches, selectBranch } = useBranch();
  return (
    <label className="flex min-w-0 items-center gap-2 text-sm">
      <Building2 className="size-5 shrink-0 text-primary" aria-hidden="true" />
      <span className="text-muted">الفرع</span>
      <select
        aria-label="الفرع"
        value={branch.id}
        onChange={(event) => selectBranch(event.target.value)}
        className="max-w-full rounded-lg border border-line bg-surface px-3 py-2 font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      >
        {branches.map((row) => (
          <option key={row.id} value={row.id}>
            {`${row.name}${row.isActive ? "" : " (مؤرشف)"}`}
          </option>
        ))}
      </select>
    </label>
  );
}