import { eq } from "drizzle-orm";
import { branches, syncOutbox, syncState, uuidv7, type Db } from "@cashier/db";
import { closeDb, createDb } from "@cashier/db";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  migrationCheckpoint,
  pendingCount,
  readSyncStatus,
  runUploadLoop,
  uploadPending,
} from "../../../../apps/api/src/desktop/upload.js";
import { loadTestEnvironment, migrationsFolder } from "../support/test-env.js";

const name = `cashier_upload_${process.pid}_${Date.now()}_test`;
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

// Sequences are explicit: this suite is about ordering and exact answers.
let nextSeq = 1;
beforeEach(async () => {
  nextSeq = 1;
  // The apply flag covers only the connection that set it.
  const connection = await db.$client.getConnection();
  try {
    await connection.query("SET @cashier_sync_apply = 1");
    await connection.query("DELETE FROM sync_outbox");
    await connection.query("DELETE FROM sync_state");
  } finally {
    await connection.query("SET @cashier_sync_apply = NULL");
    connection.release();
  }
});

const addOutboxRow = async (seq?: number, row: Record<string, unknown> = {}) => {
  const id = uuidv7();
  const entry = {
    seq: seq ?? nextSeq++,
    tableName: "employees",
    op: "upsert" as const,
    pk: { id, branch_id: branch },
    rowJson: { id, branch_id: branch, name: "Person", ...row },
  };
  await db.insert(syncOutbox).values(entry);
  return entry.seq;
};

const outboxSeqs = async () =>
  (await db.select({ seq: syncOutbox.seq }).from(syncOutbox).orderBy(syncOutbox.seq)).map(
    (row) => row.seq,
  );

/** A stand-in online endpoint that acknowledges exactly what it was sent. */
function onlineAcceptingAll() {
  const batches: number[][] = [];
  return {
    batches,
    send: async (body: { rows: Array<{ seq: number }> }) => {
      batches.push(body.rows.map((row) => row.seq));
      return { acknowledgedSeqs: body.rows.map((row) => row.seq) };
    },
  };
}

const options = (send?: unknown) => ({
  apiUrl: "https://online.invalid/api",
  deviceToken: "t".repeat(40),
  appVersion: "0.3.0",
  migrationCheckpoint: 1234,
  send: send as never,
});

describe("uploader", () => {
  it("rejects a mixed acknowledgment without deleting any sent row", async () => {
    await addOutboxRow(1);
    await expect(uploadPending(db,{...options(),send:async()=>({acknowledgedSeqs:[1,999]})})).rejects.toThrow(/answer|acknowledg/i);
    expect(await outboxSeqs()).toEqual([1]);
  });
  it("splits a batch that would be too large for the site to accept", async () => {
    // Two rows that only fit in separate requests; batching by row count alone
    // would build one oversized request and the PC would retry it forever.
    await addOutboxRow(1, { name: "س".repeat(900_000) });
    await addOutboxRow(2, { name: "س".repeat(900_000) });

    const sent: number[] = [];
    const result = await uploadPending(db, {
      ...options(),
      send: async (batch) => {
        const size = Buffer.byteLength(JSON.stringify(batch));
        expect(size).toBeLessThanOrEqual(2 * 1024 * 1024);
        sent.push(batch.rows.length);
        return { acknowledgedSeqs: batch.rows.map((row) => row.seq) };
      },
    });

    expect(sent.every((rows) => rows === 1)).toBe(true);
    expect(result).toEqual({ uploaded: 2, pending: 0 });
  });

  it("keeps the lock held by the callers still queued", async () => {
    for (const seq of [1, 2, 3, 4]) await addOutboxRow(seq);

    let running = 0;
    let overlapped = false;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let sends = 0;

    const send = async (batch: { rows: Array<{ seq: number }> }) => {
      sends += 1;
      // The first caller acknowledges nothing, so it finishes immediately while
      // leaving the queue full for the callers waiting behind it.
      if (sends === 1) return { acknowledgedSeqs: [] };
      running += 1;
      if (running > 1) overlapped = true;
      await gate;
      running -= 1;
      return { acknowledgedSeqs: batch.rows.map((row) => row.seq) };
    };

    const first = uploadPending(db, { ...options(), send });
    const second = uploadPending(db, { ...options(), send });
    const third = uploadPending(db, { ...options(), send });
    await first;

    // The lock belongs to the callers queued behind, not to the finished one.
    const late = uploadPending(db, { ...options(), send });
    // Let them actually reach their send before opening the gate, otherwise
    // nothing is ever in flight at the same time and the check proves nothing.
    for (let tick = 0; tick < 50 && sends < 2; tick += 1)
      await new Promise((resolve) => setTimeout(resolve, 10));
    release();
    await Promise.all([second, third, late]);

    expect(overlapped).toBe(false);
    expect(await outboxSeqs()).toEqual([]);
  });

  it("sends queued rows and deletes only what online acknowledged", async () => {
    await addOutboxRow();
    const online = onlineAcceptingAll();

    const result = await uploadPending(db, options(online.send));

    expect(result).toEqual({ uploaded: 1, pending: 0 });
    expect(online.batches).toEqual([[1]]);
    expect(await outboxSeqs()).toEqual([]);
  });

  it("keeps rows online did not acknowledge", async () => {
    await addOutboxRow(1);
    await addOutboxRow(2);
    await addOutboxRow(3);

    const result = await uploadPending(db, {
      ...options(),
      send: async () => ({ acknowledgedSeqs: [1] }),
    });

    expect(result).toEqual({ uploaded: 1, pending: 2 });
    expect(await outboxSeqs()).toEqual([2, 3]);
  });

  it("refuses to delete a sequence that was never in the batch", async () => {
    await addOutboxRow(1);

    await expect(uploadPending(db, {
      ...options(),
      send: async () => ({ acknowledgedSeqs: [9999] }),
    })).rejects.toThrow(/acknowledg/i);

    expect(await outboxSeqs()).toEqual([1]);
  });

  it("uploads the queue in batches instead of one large request", async () => {
    for (const seq of [1, 2, 3, 4, 5]) await addOutboxRow(seq);
    const online = onlineAcceptingAll();

    const result = await uploadPending(db, {
      ...options(online.send),
      batchSize: 2,
    });

    expect(online.batches).toEqual([[1, 2], [3, 4], [5]]);
    expect(result).toEqual({ uploaded: 5, pending: 0 });
  });

  it("sends a late lower sequence rather than skipping past it", async () => {
    // A high seq was uploaded and deleted; the lower one committed late and is
    // still queued. It must be sent, not discarded by a cursor.
    await addOutboxRow(100);
    const online = onlineAcceptingAll();
    await uploadPending(db, options(online.send));
    await addOutboxRow(9);

    await uploadPending(db, options(online.send));

    expect(online.batches).toEqual([[100], [9]]);
    expect(await outboxSeqs()).toEqual([]);
  });

  it("does nothing when there is nothing to send", async () => {
    const online = onlineAcceptingAll();

    const result = await uploadPending(db, options(online.send));

    expect(result).toEqual({ uploaded: 0, pending: 0 });
    expect(online.batches).toEqual([]);
  });

  it("records success for the backup card", async () => {
    await addOutboxRow();

    await uploadPending(db, options(onlineAcceptingAll().send));

    expect(await readSyncStatus(db)).toMatchObject({
      lastSuccessAt: expect.any(Date),
      lastError: null,
      pending: 0,
    });
  });

  it("records the reason an upload failed", async () => {
    await addOutboxRow(1);
    const online = onlineAcceptingAll();
    await uploadPending(db, options(online.send));
    await addOutboxRow(2);

    // The failure reaches the caller so the worker can log it, and the queued
    // row stays put.
    await expect(
      uploadPending(db, {
        ...options(),
        send: async () => {
          throw new Error("no network");
        },
      }),
    ).rejects.toThrow("no network");

    expect(await readSyncStatus(db)).toMatchObject({
      lastError: expect.stringContaining("no network"),
      pending: 1,
    });
    expect(await outboxSeqs()).toEqual([2]);
  });

  it("clears a previous failure once an upload succeeds again", async () => {
    await db.insert(syncState).values({ id: 1, lastError: "old failure" });
    await addOutboxRow();

    await uploadPending(db, options(onlineAcceptingAll().send));

    const [state] = await db.select().from(syncState).where(eq(syncState.id, 1));
    expect(state.lastError).toBeNull();
  });

  it("counts what is still waiting to be sent", async () => {
    await addOutboxRow(1);
    await addOutboxRow(2);

    expect(await pendingCount(db)).toBe(2);
  });

  it("keeps the diagnostic maximum acknowledged sequence", async () => {
    await addOutboxRow(4);
    await addOutboxRow(9);

    await uploadPending(db, options(onlineAcceptingAll().send));

    const [state] = await db.select().from(syncState);
    expect(state.lastUploadedSeq).toBe(9);
  });

  it("never lowers that maximum when an earlier sequence is sent", async () => {
    await addOutboxRow(9);
    await uploadPending(db, options(onlineAcceptingAll().send));
    await addOutboxRow(3);
    await uploadPending(db, options(onlineAcceptingAll().send));

    const [state] = await db.select().from(syncState);
    expect(state.lastUploadedSeq).toBe(9);
  });

  it("stores its state in the single sync_state row", async () => {
    await addOutboxRow();

    await uploadPending(db, options(onlineAcceptingAll().send));

    const rows = await db.select().from(syncState);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(1);
  });

  it("runs one upload at a time and never overlaps", async () => {
    await addOutboxRow();
    let running = 0;
    let overlapped = false;
    const send = async (body: { rows: Array<{ seq: number }> }) => {
      running += 1;
      if (running > 1) overlapped = true;
      await new Promise((resolve) => setTimeout(resolve, 20));
      running -= 1;
      return { acknowledgedSeqs: body.rows.map((row) => row.seq) };
    };

    await Promise.all([
      uploadPending(db, options(send)),
      uploadPending(db, options(send)),
    ]);

    expect(overlapped).toBe(false);
  });

  it("stops the loop when it is aborted", async () => {
    const controller = new AbortController();
    let calls = 0;

    await runUploadLoop(async () => {
      calls += 1;
      controller.abort();
    }, controller.signal);

    expect(calls).toBe(1);
  });

  it("survives a failing upload and tries again later", async () => {
    const errors: unknown[] = [];
    const controller = new AbortController();
    let calls = 0;

    await runUploadLoop(
      async () => {
        calls += 1;
        throw new Error("offline");
      },
      controller.signal,
      (error) => {
        errors.push(error);
        controller.abort();
      },
      10,
    );

    expect(calls).toBe(1);
    expect(errors).toHaveLength(1);
  });

  it("waits between rounds instead of spinning", async () => {
    const controller = new AbortController();
    let calls = 0;

    const loop = runUploadLoop(async () => {
      calls += 1;
      if (calls === 1) setTimeout(() => controller.abort(), 5);
    }, controller.signal, () => undefined, 20);
    await loop;

    expect(calls).toBe(1);
  });

  it("reports the database's own migration checkpoint", async () => {
    const [rows] = await db.$client.query(
      "SELECT MAX(created_at) AS checkpoint FROM __drizzle_migrations",
    );

    expect(await migrationCheckpoint(db)).toBe(
      Number((rows as Array<{ checkpoint: number }>)[0].checkpoint),
    );
  });
});
