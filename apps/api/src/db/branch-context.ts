import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import type { Db } from "./index.js";
import { branches } from "./schema.js";
import { HttpError } from "../middleware/error.js";

const context = new AsyncLocalStorage<{ id: number; writable: boolean }>();

// Seeds and existing direct repository callers use the migrated Main Branch.
// HTTP operations establish their validated branch before entering any module.
export const currentBranchId = () => context.getStore()?.id ?? 1;

export function withBranch<T>(
  branchId: number,
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
): Array<T & { branchId: number }>;
export function branchValues<T extends object>(
  row: T,
): T & { branchId: number };
export function branchValues<T extends object>(input: T | T[]) {
  const assign = (row: T) => ({ ...row, branchId: currentBranchId() });
  return Array.isArray(input) ? input.map(assign) : assign(input);
}

export function branchTable(name: string) {
  return sql`(SELECT * FROM ${sql.identifier(name)} WHERE branch_id=${currentBranchId()})`;
}
