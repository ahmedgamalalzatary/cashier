import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import type { Db } from "./client.js";
import { branches } from "./schema.js";
import { HttpError } from "./http-error.js";

const context = new AsyncLocalStorage<{ id: string; writable: boolean }>();

// HTTP handlers, workers and direct callers must establish their branch scope.
export const currentBranchId = () => {
  const branchId = context.getStore()?.id;
  if (!branchId) throw new HttpError(500, "Branch scope is required");
  return branchId;
};

export function withBranch<T>(
  branchId: string,
  action: () => T,
  writable = true,
): T {
  return context.run({ id: branchId, writable }, action);
}

export function branchTransaction<T>(
  db: Db,
  action: (tx: Db) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const scope = context.getStore();
    if (scope?.writable) {
      const [branch] = await tx
        .select()
        .from(branches)
        .where(eq(branches.id, scope.id))
        .for("share");
      if (!branch?.isActive) throw new HttpError(409, "الفرع غير نشط");
    }
    return action(tx as unknown as Db);
  });
}

export function branchCondition(
  table: { branchId: AnyMySqlColumn },
  condition?: SQL,
) {
  return and(eq(table.branchId, currentBranchId()), condition)!;
}

export function branchValues<T extends object>(
  rows: T[],
): Array<T & { branchId: string }>;
export function branchValues<T extends object>(
  row: T,
): T & { branchId: string };
export function branchValues<T extends object>(input: T | T[]) {
  const assign = (row: T) => ({ ...row, branchId: currentBranchId() });
  return Array.isArray(input) ? input.map(assign) : assign(input);
}

export function branchTable(name: string) {
  return sql`(SELECT * FROM ${sql.identifier(name)} WHERE branch_id=${currentBranchId()})`;
}
