import path from "node:path";
import fs from "node:fs";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, is } from "drizzle-orm";
import { getTableConfig, MySqlTable } from "drizzle-orm/mysql-core";
import { closeDb, createDb, type Db } from "../../src/client.js";
import { syncConfiguredAdmin } from "../../src/seed-admin.js";
import {
  branchTransaction,
  branchValues,
  withBranch,
} from "../../src/branch-context.js";
import * as schema from "../../src/schema.js";
import { loadTestEnvironment } from "../support/test-env.js";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const databaseName = `cashier_schema43_${process.pid}_test`;
const tables = Object.values(schema).filter((table) => is(table, MySqlTable));
let connection: Connection | undefined;
let db: Db | undefined;
let created = false;

beforeAll(async () => {
  const url = new URL(loadTestEnvironment());
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Schema verification requires local test MySQL");
  if (!/^cashier_schema43_\d+_test$/.test(databaseName))
    throw new Error("Unexpected scratch database name");
  url.pathname = "/";
  connection = await mysql.createConnection(url.toString());
  // No IF NOT EXISTS: never reuse or clear a database belonging to another run.
  await connection.query(`CREATE DATABASE \`${databaseName}\``);
  created = true;
  await connection.changeUser({ database: databaseName });
  await connection.query("SET time_zone = '+00:00'");
  url.pathname = `/${databaseName}`;
  db = createDb(url.toString());
  await migrate(db, { migrationsFolder: path.join(packageRoot, "drizzle") });
});

beforeEach(async () => {
  if (!connection || !created) throw new Error("Scratch database is not ready");
  await connection.query("SET FOREIGN_KEY_CHECKS = 0");
  await connection.query("SET @cashier_sync_apply = 1");
  try {
    for (const table of tables) {
      const name = getTableConfig(table).name;
      if (!/^[a-z_]+$/.test(name))
        throw new Error("Unexpected schema table name");
      await connection.query(`DELETE FROM \`${name}\``);
    }
  } finally {
    await connection.query("SET @cashier_sync_apply = NULL");
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  }
});

afterAll(async () => {
  if (db) await closeDb(db);
  if (connection) {
    try {
      if (created) await connection.query(`DROP DATABASE \`${databaseName}\``);
    } finally {
      await connection.end();
    }
  }
});

async function branch(name: string) {
  const [row] = await db!
    .insert(schema.branches)
    .values({ name })
    .$returningId();
  return row.id;
}
async function cashier(branchId: string, username: string) {
  const [employee] = await db!
    .insert(schema.employees)
    .values({ branchId, name: username })
    .$returningId();
  const [user] = await db!
    .insert(schema.users)
    .values({
      branchId,
      employeeId: employee.id,
      name: username,
      username,
      role: "cashier",
      passwordHash: "test-only",
    })
    .$returningId();
  return { cashierUserId: user.id, employeeId: employee.id };
}
const open = (branchId: string, actor: Awaited<ReturnType<typeof cashier>>) =>
  db!
    .insert(schema.shifts)
    .values({
      branchId,
      ...actor,
      openingFloat: "100.00",
      openedAt: new Date(),
      status: "open",
      openSlot: 1,
    })
    .$returningId();

describe("fresh desktop schema", () => {
  it("installs every table and stores UUID columns as ASCII binary CHAR(36)", async () => {
    const [columns] = await connection!.query<RowDataPacket[]>(
      "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, CHARACTER_SET_NAME, COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME <> '__drizzle_migrations'",
      [databaseName],
    );
    expect(
      [...new Set(columns.map((column) => column.TABLE_NAME))].sort(),
    ).toEqual(tables.map((table) => getTableConfig(table).name).sort());
    for (const table of tables) {
      const config = getTableConfig(table);
      for (const column of config.columns.filter((column) =>
        column.getSQLType().startsWith("char(36)"),
      )) {
        expect(
          columns.find(
            (row) =>
              row.TABLE_NAME === config.name && row.COLUMN_NAME === column.name,
          ),
        ).toMatchObject({
          COLUMN_TYPE: "char(36)",
          CHARACTER_SET_NAME: "ascii",
          COLLATION_NAME: "ascii_bin",
        });
      }
    }
  });

  it("reapplying migrations preserves rows without duplicate journal entries", async () => {
    const id = await branch("Keep this branch");
    await migrate(db!, { migrationsFolder: path.join(packageRoot, "drizzle") });
    expect(await db!.select().from(schema.branches)).toEqual([
      expect.objectContaining({ id, name: "Keep this branch" }),
    ]);
    const [rows] = await connection!.query<RowDataPacket[]>(
      "SELECT hash, created_at FROM __drizzle_migrations",
    );
    const journal = JSON.parse(
      fs.readFileSync(
        path.join(packageRoot, "drizzle/meta/_journal.json"),
        "utf8",
      ),
    );
    expect(rows).toHaveLength(journal.entries.length);
    expect(rows[0].hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("bootstraps the configured admin on the baseline without inventing a branch or revoking unchanged sessions", async () => {
    const admin = {
      name: "Baseline admin",
      username: "baseline-admin",
      password: "baseline-test-password",
    };
    expect(await syncConfiguredAdmin(db!, admin)).toBe("created");
    expect(await syncConfiguredAdmin(db!, admin)).toBe("unchanged");
    const rows = await db!.select().from(schema.users);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: expect.stringMatching(/^[a-f0-9-]{14}7[a-f0-9-]{21}$/),
      branchId: null,
      role: "admin",
      isSuperAdmin: true,
      isActive: true,
      tokenVersion: 0,
    });
    expect(await db!.select().from(schema.branches)).toHaveLength(0);
  });

  it("allows repeated cashier usernames across branches and an admin of the same name", async () => {
    const first = await branch("First");
    const second = await branch("Second");
    await cashier(first, "ali");
    await cashier(second, "ali");
    await db!.insert(schema.users).values({
      name: "Admin",
      username: "ali",
      role: "admin",
      passwordHash: "test-only",
    });
    await expect(cashier(first, "ali")).rejects.toThrow();
    await expect(
      db!.insert(schema.users).values({
        name: "Another admin",
        username: "ali",
        role: "admin",
        passwordHash: "test-only",
      }),
    ).rejects.toThrow();
    expect(await db!.select().from(schema.users)).toHaveLength(3);
  });

  it("allows exactly one winner when two cashiers open the same branch concurrently", async () => {
    const id = await branch("Shop");
    const first = await cashier(id, "first");
    const second = await cashier(id, "second");
    const results = await Promise.allSettled([
      open(id, first),
      open(id, second),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(await db!.select().from(schema.shifts)).toHaveLength(1);
  });

  it("frees the branch slot after a system close and permits a different cashier", async () => {
    const id = await branch("Shop");
    const first = await cashier(id, "first");
    const second = await cashier(id, "second");
    const [shift] = await open(id, first);
    await db!
      .update(schema.shifts)
      .set({
        status: "closed",
        openSlot: null,
        closedAt: new Date(),
        closedByUserId: null,
        actualCash: null,
        overShort: null,
        expectedCash: "100.00",
      })
      .where(eq(schema.shifts.id, shift.id));
    await db!.insert(schema.shiftEvents).values({
      branchId: id,
      shiftId: shift.id,
      action: "auto_close",
      actorUserId: null,
      occurredAt: new Date(),
    });
    await open(id, second);
    await expect(
      db!
        .update(schema.shifts)
        .set({ status: "open", openSlot: 1 })
        .where(eq(schema.shifts.id, shift.id)),
    ).rejects.toThrow();
    expect(await db!.select().from(schema.shifts)).toHaveLength(2);
  });

  it("enforces branch-scoped foreign keys and preserves numeric external IDs", async () => {
    const first = await branch("First");
    const second = await branch("Second");
    const [category] = await db!
      .insert(schema.categories)
      .values({ branchId: first, name: "Food" })
      .$returningId();
    await expect(
      db!.insert(schema.items).values({
        branchId: second,
        categoryId: category.id,
        code: 1,
        name: "Wrong branch",
        type: "raw",
        stockUnit: "kg",
      }),
    ).rejects.toThrow();
    for (const branchId of [first, second])
      await db!.insert(schema.externalCategories).values({
        branchId,
        externalId: 7,
        nameAr: "Food",
        nameEn: "Food",
        isActive: true,
        isVisible: true,
        displayOrder: 0,
        syncedAt: new Date(),
      });
    expect(
      (await db!.select().from(schema.externalCategories)).map(
        (row) => row.externalId,
      ),
    ).toEqual([7, 7]);
  });

  it("requires explicit UUID branch scope and refuses archived branch writes", async () => {
    const id = await branch("Shop");
    await withBranch(id, () =>
      branchTransaction(db!, (tx) =>
        tx.insert(schema.suppliers).values(branchValues({ name: "Supplier" })),
      ),
    );
    expect((await db!.select().from(schema.suppliers))[0].branchId).toBe(id);
    await db!
      .update(schema.branches)
      .set({ isActive: false })
      .where(eq(schema.branches.id, id));
    await expect(
      withBranch(id, () =>
        branchTransaction(db!, (tx) =>
          tx.insert(schema.suppliers).values(branchValues({ name: "Blocked" })),
        ),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(await db!.select().from(schema.suppliers)).toHaveLength(1);
  });

  it("persists account/link/backup rows and enforces one device and one sync-state row", async () => {
    const branchId = await branch("Shop");
    const [admin] = await db!
      .insert(schema.users)
      .values({
        name: "Admin",
        username: "admin",
        role: "admin",
        passwordHash: "test-only",
      })
      .$returningId();
    await db!
      .insert(schema.adminBranches)
      .values({ adminUserId: admin.id, branchId });
    await db!
      .insert(schema.devices)
      .values({ branchId, tokenHash: "a".repeat(64) });
    await expect(
      db!
        .insert(schema.devices)
        .values({ branchId, tokenHash: "b".repeat(64) }),
    ).rejects.toThrow();
    await db!.insert(schema.linkCodes).values({
      branchId,
      codeHash: "c".repeat(64),
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await db!.insert(schema.syncOutbox).values({
      tableName: "users",
      op: "upsert",
      pk: { id: admin.id },
      rowJson: { id: admin.id },
    });
    await db!.insert(schema.syncOutbox).values({
      tableName: "users",
      op: "delete",
      pk: { id: admin.id },
    });
    await db!.insert(schema.syncState).values({ id: 1 });
    await expect(
      db!.insert(schema.syncState).values({ id: 2 }),
    ).rejects.toThrow();
    expect((await db!.select().from(schema.users))[0].branchId).toBeNull();
    expect(await db!.select().from(schema.adminBranches)).toHaveLength(1);
    const outbox = await db!
      .select()
      .from(schema.syncOutbox)
      .orderBy(schema.syncOutbox.seq);
    expect(outbox[0]).toMatchObject({ pk: { id: admin.id }, op: "upsert" });
    expect(outbox[1]).toMatchObject({
      pk: { id: admin.id },
      op: "delete",
      rowJson: null,
    });
    expect(outbox[1].seq).toBeGreaterThan(outbox[0].seq);
    expect((await db!.select().from(schema.syncState))[0].lastUploadedSeq).toBe(
      0,
    );
  });
});
