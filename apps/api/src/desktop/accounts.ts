import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { adminBranches, branches, users, type Db } from "@cashier/db";
import { z } from "zod";
import { UNLINKED_MESSAGE } from "./upload.js";

const account = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(191),
  username: z.string().min(1).max(100),
  passwordHash: z.string().regex(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/),
  role: z.literal("admin"),
  isSuperAdmin: z.boolean(),
  isActive: z.boolean(),
  tokenVersion: z.number().int().min(0).max(2_147_483_647),
});
const accountsAnswer = z
  .object({
    branch: z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(191),
      isActive: z.boolean(),
      createdAt: z.string().datetime(),
    }),
    users: z.array(account).min(1),
    adminBranches: z.array(
      z.object({ adminUserId: z.string().uuid(), branchId: z.string().uuid() }),
    ),
  })
  .superRefine((snapshot, context) => {
    const ids = new Set(snapshot.users.map((user) => user.id));
    const assigned = new Set(
      snapshot.adminBranches.map((row) => row.adminUserId),
    );
    const usernames = new Set(snapshot.users.map((user) => user.username));
    if (
      ids.size !== snapshot.users.length ||
      assigned.size !== snapshot.adminBranches.length ||
      usernames.size !== snapshot.users.length ||
      snapshot.users.filter((user) => user.isSuperAdmin).length !== 1 ||
      snapshot.adminBranches.some(
        (row) =>
          row.branchId !== snapshot.branch.id || !ids.has(row.adminUserId),
      ) ||
      snapshot.users.some(
        (user) => !user.isSuperAdmin && !assigned.has(user.id),
      )
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Inconsistent account snapshot",
      });
  });

/** Validate the complete answer before any local write or account removal. */
function parseAccounts(snapshot: unknown, branchId: string) {
  const parsed = accountsAnswer.safeParse(snapshot);
  if (!parsed.success || parsed.data.branch.id !== branchId)
    throw new Error("Invalid account snapshot for this PC's branch");
  return parsed.data;
}

/** Apply online-owned accounts atomically, preserving local cashier identities. */
export async function applyDeviceAccounts(
  db: Db,
  branchId: string,
  snapshot: unknown,
) {
  const incoming = parseAccounts(snapshot, branchId);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET @cashier_sync_apply = 1`);
    try {
      const held = await tx
        .select({ id: branches.id })
        .from(branches)
        .for("update");
      if (held.length !== 1 || held[0].id !== branchId)
        throw new Error(
          "Account snapshot cannot replace another branch's data",
        );
      const existing = await tx.select().from(users).for("update");
      if (
        existing.some(
          (user) =>
            user.role !== "admin" &&
            incoming.users.some((row) => row.id === user.id),
        )
      )
        throw new Error(
          "Account snapshot conflicts with a local cashier identity",
        );
      const oldAdmins = existing.filter((user) => user.role === "admin");
      // Free usernames within this transaction so swaps and renamed legacy
      // accounts cannot cause an upsert to overwrite a different identity.
      for (const old of oldAdmins)
        await tx
          .update(users)
          .set({ username: `@accounts-${randomUUID()}`, isActive: false })
          .where(eq(users.id, old.id));
      for (const user of incoming.users) {
        const values = { ...user, branchId: null, employeeId: null };
        if (oldAdmins.some((old) => old.id === user.id))
          await tx.update(users).set(values).where(eq(users.id, user.id));
        else await tx.insert(users).values(values);
      }
      // Retain absent admins for history. Restore their username unless online
      // assigned it elsewhere, using the database's actual collation.
      for (const old of oldAdmins.filter(
        (user) => !incoming.users.some((row) => row.id === user.id),
      )) {
        const clashes = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(eq(users.role, "admin"), eq(users.username, old.username)),
          );
        if (!clashes.length)
          await tx
            .update(users)
            .set({ username: old.username })
            .where(eq(users.id, old.id));
      }
      await tx
        .delete(adminBranches)
        .where(eq(adminBranches.branchId, branchId));
      if (incoming.adminBranches.length)
        await tx.insert(adminBranches).values(incoming.adminBranches);
      await tx
        .update(branches)
        .set({
          name: incoming.branch.name,
          isActive: incoming.branch.isActive,
          createdAt: new Date(incoming.branch.createdAt),
        })
        .where(eq(branches.id, branchId));
    } finally {
      // A MySQL session variable survives rollback; do not leak it into the pool.
      await tx.execute(sql`SET @cashier_sync_apply = 0`);
    }
  });
}

export class DeviceUnlinkedError extends Error {
  constructor() {
    super(UNLINKED_MESSAGE);
  }
}

/** Fetch the device-scoped snapshot without exposing credentials in errors. */
export async function requestDeviceAccounts({
  apiUrl,
  branchId,
  deviceToken,
  appVersion,
  signal,
  fetch = globalThis.fetch,
}: {
  apiUrl: string;
  branchId: string;
  deviceToken: string;
  appVersion: string;
  signal?: AbortSignal;
  fetch?: typeof globalThis.fetch;
}) {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const stop = () => controller.abort();
  signal?.addEventListener("abort", stop, { once: true });
  const timer = setTimeout(stop, 5_000);
  try {
    let response: Response;
    try {
      response = await fetch(`${apiUrl}/device/accounts`, {
        headers: {
          Authorization: `Device ${deviceToken}`,
          "X-Cashier-Version": appVersion,
        },
        signal: controller.signal,
      });
    } catch {
      throw new Error(
        "Unable to download accounts; cached accounts remain available.",
      );
    }
    if (response.status === 401) throw new DeviceUnlinkedError();
    if (!response.ok)
      throw new Error(`Unable to download accounts (${response.status}).`);
    const body: unknown = await response.json().catch(() => undefined);
    return parseAccounts(body, branchId);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
}

/** One pull at a time; offline failures retain the cache and retry in 15 min. */
export async function runAccountsLoop(
  pull: () => Promise<unknown>,
  signal: AbortSignal,
  reportError: (error: unknown) => void = (error) =>
    console.error(
      error instanceof DeviceUnlinkedError
        ? error.message
        : "Accounts pull failed; cached accounts are unchanged.",
    ),
) {
  while (!signal.aborted) {
    try {
      await pull();
    } catch (error) {
      if (!signal.aborted) reportError(error);
      if (error instanceof DeviceUnlinkedError) return;
    }
    if (signal.aborted) return;
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", finish);
        resolve();
      };
      const timer = setTimeout(finish, 15 * 60_000);
      signal.addEventListener("abort", finish, { once: true });
      if (signal.aborted) finish();
    });
  }
}
