import { eq } from "drizzle-orm";
import type { Db } from "@cashier/db";
import { branches, withBranch } from "@cashier/db";
import { ShiftsRepository } from "./shifts.repository.js";
import { ShiftsService } from "./shifts.service.js";

export const AUTO_CLOSE_INTERVAL_MS = 60_000;

/**
 * Closes expired shifts in every active branch. A branch that fails does not
 * stop the sweep, so one broken workspace cannot keep the others open forever.
 */
export async function autoCloseExpiredBranches(
  db: Db,
  close: (branchId: string) => Promise<number>,
  signal?: AbortSignal,
  onError: (branchId: string, error: unknown) => void = (id, error) =>
    console.error(`Shift auto-close failed for branch ${id}`, error),
) {
  const active = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.isActive, true))
    .orderBy(branches.id);
  let closed = 0;
  for (const branch of active) {
    signal?.throwIfAborted();
    try {
      closed += await close(branch.id);
    } catch (error) {
      if (!signal?.aborted) onError(branch.id, error);
    }
  }
  return closed;
}

/** Closes expired shifts in one branch, inside that branch's context. */
export function createAutoCloseForDb(db: Db) {
  return (branchId: string) =>
    withBranch(branchId, () =>
      new ShiftsService(new ShiftsRepository(db)).autoCloseExpired(),
    );
}

/**
 * Runs the sweep on a fixed interval so a forgotten shift closes even when
 * nobody touches that PC again. The interval is a parameter so tests do not
 * have to wait a minute.
 */
export async function runAutoCloseLoop(
  db: Db,
  signal: AbortSignal,
  intervalMs = AUTO_CLOSE_INTERVAL_MS,
  onError: (branchId: string, error: unknown) => void = (id, error) =>
    console.error(`Shift auto-close failed for branch ${id}`, error),
) {
  const close = createAutoCloseForDb(db);
  while (!signal.aborted) {
    try {
      await autoCloseExpiredBranches(db, close, signal, onError);
    } catch (error) {
      if (!signal.aborted) onError("unknown", error);
    }
    if (signal.aborted) break;
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", finish);
        resolve();
      };
      const timer = setTimeout(finish, intervalMs);
      signal.addEventListener("abort", finish, { once: true });
      if (signal.aborted) finish();
    });
  }
}
