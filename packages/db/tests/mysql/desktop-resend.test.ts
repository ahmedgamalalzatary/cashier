import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import {
  branches,
  categories,
  employees,
  syncOutbox,
  syncState,
  uuidv7,
  closeDb,
  createDb,
  type Db,
} from "@cashier/db";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requeueEverything } from "../../../../apps/api/src/desktop/resend.js";
import { createBackupClient } from "../../../../apps/api/src/desktop/backup-client.js";
import { pendingCount } from "../../../../apps/api/src/desktop/upload.js";
import { loadTestEnvironment, migrationsFolder } from "../support/test-env.js";

const name = `cashier_resend_${process.pid}_${Date.now()}_test`;
const branch = uuidv7();
let db: Db;
let owner: mysql.Connection;

beforeAll(async () => {
  owner = await mysql.createConnection(loadTestEnvironment());
  await owner.query("CREATE DATABASE ?? CHARACTER SET utf8mb4", [name]);
  db = createDb(loadTestEnvironment({ databaseName: name }));
  await migrate(db, { migrationsFolder });
  await db.insert(branches).values({ id: branch, name: "Shop" });
}, 90_000);

afterAll(async () => {
  await closeDb(db);
  await owner.query("DROP DATABASE IF EXISTS ??", [name]);
  await owner.end();
});

beforeEach(async () => {
  await db.$client.query("SET @cashier_sync_apply = 1");
  for (const table of [
    "sync_outbox",
    "sync_state",
    "employees",
    "categories",
    "users",
  ])
    await db.$client.query(`DELETE FROM \`${table}\``);
  await db.$client.query("SET @cashier_sync_apply = NULL");
});

/** MySQL cannot return an id from an insert, so the row is read back. */
async function addEmployee(name: string) {
  await db.insert(employees).values({ branchId: branch, name });
  const [row] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.name, name));
  return row;
}

/** Triggers queue changes too; these tests count only what the tool queues. */
const clearQueue = () => db.$client.query("DELETE FROM sync_outbox");

const outbox = () => db.select().from(syncOutbox).orderBy(syncOutbox.seq);

describe("full resend", () => {
  it("does not enqueue an old snapshot after a concurrent delete", async () => {
    const {id}=await addEmployee("Concurrent delete");
    await clearQueue();
    const writer=await db.$client.getConnection();
    await writer.beginTransaction();
    await writer.query("DELETE FROM employees WHERE id=?",[id]);
    let commit:Promise<void>|undefined;
    const release=()=>commit??=writer.commit();
    const timer=setTimeout(()=>void release(),100);
    const raced={
      $client:{query:async(...args:Parameters<typeof db.$client.query>)=>{
        const result=await db.$client.query(...args);
        if(String(args[0]).startsWith("SELECT ") && String(args[0]).includes("FROM `employees`")) {
          await release();
          clearTimeout(timer);
        }
        return result;
      }},
      transaction:db.transaction.bind(db),
    } as unknown as Db;
    try {
      await requeueEverything(raced);
      await release();
      expect((await outbox()).filter(row=>row.pk.id===id).map(row=>row.op)).toEqual(["delete"]);
    } finally { clearTimeout(timer); await release(); writer.release(); }
  });
  it("queues every current business row", async () => {
    await addEmployee("أحمد");
    await addEmployee("سارة");
    await db.insert(categories).values({ branchId: branch, name: "مشروبات" });

    await clearQueue();
    const queued = await requeueEverything(db);

    expect(queued).toBe(3);
    const rows = await outbox();
    expect(rows.map((row) => row.tableName).sort()).toEqual([
      "categories",
      "employees",
      "employees",
    ]);
    expect(rows.every((row) => row.op === "upsert")).toBe(true);
  });

  it("carries the full row so online can rebuild it", async () => {
    const { id } = await addEmployee("Complete row");

    await clearQueue();

    await requeueEverything(db);

    const [row] = await outbox();
    expect(row.pk).toEqual({ id, branch_id: branch });
    expect(row.rowJson).toMatchObject({ id, branch_id: branch, name: "Complete row" });
  });

  it("keeps the deletions already waiting to be sent", async () => {
    const { id } = await addEmployee("Removed");
    await db.delete(employees).where(eq(employees.id, id));
    const survivor = await addEmployee("Still here");
    const queued = await pendingCount(db);

    await requeueEverything(db);

    const rows = await outbox();
    // The tombstone from the trigger is still queued, and the rebuild adds the
    // rows that still exist on top of it without clearing it.
    expect(
      rows.filter(
        (row) => row.op === "delete" && (row.pk as { id: string }).id === id,
      ),
    ).toHaveLength(1);
    expect(
      rows.filter(
        (row) =>
          row.op === "upsert" && (row.pk as { id: string }).id === survivor.id,
      ),
    ).toHaveLength(2);
    expect(queued).toBeGreaterThan(0);
  });

  it("gives resent rows sequences above every sequence ever used", async () => {
    // A number that online has already seen must never come round again, even
    // after the queue is emptied.
    await db.insert(syncOutbox).values({
      seq: 7000,
      tableName: "employees",
      op: "delete",
      pk: { id: randomUUID(), branch_id: branch },
      rowJson: null,
    } as never);
    await addEmployee("Rebuilt");
    await clearQueue();

    await requeueEverything(db);

    const rows = await outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0].seq).toBeGreaterThan(7000);
  });

  it("never lowers the auto-increment counter it inherits", async () => {
    await db.insert(syncOutbox).values({
      seq: 5000,
      tableName: "employees",
      op: "delete",
      pk: { id: randomUUID(), branch_id: branch },
      rowJson: null,
    } as never);

    await addEmployee("After a high sequence");
    await requeueEverything(db);

    const rows = await outbox();
    expect(rows.map((row) => row.seq)).toContain(5000);
    expect(Math.max(...rows.map((row) => row.seq))).toBeGreaterThan(5000);
  });

  it("queues nothing when there is no business data", async () => {
    await clearQueue();
    expect(await requeueEverything(db)).toBe(0);
    expect(await outbox()).toEqual([]);
  });

  it("queues cashier accounts and never admin accounts", async () => {
    const cashier = randomUUID();
    const admin = randomUUID();
    await db.$client.query(
      "INSERT INTO users (id,branch_id,name,username,password_hash,role) VALUES (?,?,?,'c','h','cashier')",
      [cashier, branch, "Cashier"],
    );
    await db.$client.query(
      "INSERT INTO users (id,name,username,password_hash,role,is_super_admin) VALUES (?,?,'root','h','admin',1)",
      [admin, "Super"],
    );

    await clearQueue();

    await requeueEverything(db);

    const rows = (await outbox()).filter((row) => row.tableName === "users");
    expect(rows).toHaveLength(1);
    expect(rows[0].pk).toEqual({ id: cashier, branch_id: branch });
  });

  it("never queues accounts that arrive from online", async () => {
    await db.$client.query(
      "INSERT INTO branches (id,name) VALUES ('00000000-0000-7000-8000-0000000000ff','Online')",
    );

    await clearQueue();

    await requeueEverything(db);

    expect((await outbox()).some((row) => row.tableName === "branches")).toBe(
      false,
    );
  });
});
describe("first backup", () => {
  const directories: string[] = [];
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const directory of directories.splice(0)) {
      if (!directory.startsWith(path.join(os.tmpdir(), "cashier-first-backup-")))
        throw new Error("Unexpected scratch path");
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  /**
   * The PC's real backup client against this database. Online issues a new
   * generation and then refuses the upload, so the queue stays put to inspect.
   */
  function backupClient() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cashier-first-backup-"));
    directories.push(directory);
    const generationRequests: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string }) => {
        if (!url.endsWith("/device/backup-generation"))
          return new Response("{}", { status: 503 });
        generationRequests.push(JSON.parse(init.body));
        return Response.json({ generation: generationRequests.length });
      }),
    );
    const client = createBackupClient(
      db,
      directory,
      {
        apiUrl: "http://online.test/api",
        deviceToken: "first-backup-device-token",
        appVersion: "test",
        migrationCheckpoint: 0,
      },
      () => {},
    );
    return { client, generationRequests };
  }

  it("retries a failed capture instead of marking it complete", async () => {
    await addEmployee("Retry capture");
    await clearQueue();
    const { client } = backupClient();
    await db.$client.query("RENAME TABLE employees TO employees_temporarily_unavailable");
    try { await expect(client.uploadNow()).rejects.toThrow(/employees/); }
    finally { await db.$client.query("RENAME TABLE employees_temporarily_unavailable TO employees"); }
    expect(await pendingCount(db)).toBe(0);
    expect((await db.select().from(syncState))[0]?.bootstrappedAt ?? null).toBeNull();

    await expect(client.uploadNow()).rejects.toThrow(/503/);

    expect((await outbox()).map((row) => row.rowJson?.name)).toEqual(["Retry capture"]);
  });

  it("queues rows that existed before capture triggers were installed", async () => {
    // Triggers are silent here, as they were before Phase 10 shipped.
    await db.$client.query("SET @cashier_sync_apply = 1");
    await addEmployee("Predates the triggers");
    await db.$client.query("SET @cashier_sync_apply = NULL");
    expect(await pendingCount(db)).toBe(0);

    await expect(backupClient().client.uploadNow()).rejects.toThrow(/503/);

    expect((await outbox()).map((row) => row.tableName)).toEqual(["employees"]);
  });

  it("keeps waiting work and adds history on top of it", async () => {
    // Written before the capture triggers existed, so nothing queued it.
    await db.$client.query("SET @cashier_sync_apply = 1");
    await addEmployee("تاريخي");
    await db.$client.query("SET @cashier_sync_apply = NULL");
    // Written after, so the trigger queued it.
    await addEmployee("محفوظ");
    expect(await pendingCount(db)).toBe(1);

    await expect(backupClient().client.uploadNow()).rejects.toThrow(/503/);

    // Queued work is not proof that history was captured.
    expect(await pendingCount(db)).toBe(3);
  });

  it("captures history once per backup, not on every retry", async () => {
    await addEmployee("Predates");
    await clearQueue();
    const { client, generationRequests } = backupClient();
    await expect(client.uploadNow()).rejects.toThrow(/503/);

    await expect(client.uploadNow()).rejects.toThrow(/503/);

    expect(generationRequests).toHaveLength(1);
    expect(await pendingCount(db)).toBe(1);
  });
});
