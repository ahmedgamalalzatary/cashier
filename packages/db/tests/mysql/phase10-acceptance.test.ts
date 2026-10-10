import { eq } from "drizzle-orm";
import {
  branches,
  closeDb,
  createDb,
  devices,
  employees,
  orders,
  syncIngestEvents,
  syncIngestRows,
  syncOutbox,
  syncState,
  users,
  uuidv7,
  type Db,
} from "@cashier/db";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it,vi } from "vitest";
import { startDesktopApi } from "../../../../apps/api/src/desktop/runtime.js";
import { createApp as createOnlineApp } from "../../../../apps/online-api/src/app.js";
import { hashDeviceToken } from "../../../../packages/server-core/src/modules/devices/device-link.service.js";
import { requeueEverything } from "../../../../apps/api/src/desktop/resend.js";
import { uploadPending } from "../../../../apps/api/src/desktop/upload.js";
import { loadTestEnvironment, migrationsFolder } from "../support/test-env.js";

/**
 * The Phase 10 acceptance line: a PC sells for a day with no network, then
 * reconnects, and online ends up with exactly the same business rows.
 */
const branch = uuidv7();
const otherBranch = uuidv7();
const token = "acceptance-device-token-with-32-characters";
const appVersion = "0.3.0";
const jwtSecret = "phase-10-acceptance-secret-at-least-32-chars";
const owned: Array<{ db: Db; name: string; owner: mysql.Connection }> = [];
let online: Db;
let shop: Db;
let checkpoint = 0;
// Built in beforeAll, once the real online database exists.
let onlineApp: ReturnType<typeof createOnlineApp>;

async function createDatabase(label: string) {
  const dbName = `cashier_p10_${label}_${process.pid}_${Date.now()}_test`;
  const owner = await mysql.createConnection(loadTestEnvironment());
  await owner.query("CREATE DATABASE ?? CHARACTER SET utf8mb4", [dbName]);
  const db = createDb(loadTestEnvironment({ databaseName: dbName }));
  await migrate(db, { migrationsFolder });
  owned.push({ db, name: dbName, owner });
  return db;
}

beforeAll(async () => {
  online = await createDatabase("online");
  shop = await createDatabase("shop");
  onlineApp = createOnlineApp(online, {
    jwtSecret,
    corsOrigins: ["https://cashier.biscofa.tech"],
  });
  for (const db of [online, shop])
    await db.insert(branches).values([
      { id: branch, name: "Main street" },
      { id: otherBranch, name: "Other street" },
    ]);
  await online.insert(devices).values({
    id: uuidv7(),
    branchId: branch,
    tokenHash: hashDeviceToken(token),
  });
  const [rows] = await shop.$client.query(
    "SELECT MAX(created_at) AS checkpoint FROM __drizzle_migrations",
  );
  checkpoint = Number((rows as Array<{ checkpoint: number }>)[0].checkpoint);
}, 180_000);

afterAll(async () => {
  for (const { db, name, owner } of owned.reverse()) {
    await closeDb(db);
    await owner.query("DROP DATABASE IF EXISTS ??", [name]);
    await owner.end();
  }
});

beforeEach(async () => {
  for (const db of [online, shop]) {
    await db.$client.query("SET FOREIGN_KEY_CHECKS = 0");
    await db.$client.query("SET @cashier_sync_apply = 1");
    for (const table of [
      "sync_outbox",
      "sync_state",
      "sync_ingest_events",
      "sync_ingest_rows",
      "sync_ingest_pending",
      "orders",
      "employees",
      "users",
    ])
      await db.$client.query(`DELETE FROM \`${table}\``);
    await db.$client.query("SET @cashier_sync_apply = NULL");
    await db.$client.query("SET FOREIGN_KEY_CHECKS = 1");
  }
  await online.update(devices).set({backupGeneration:0,backupRequestId:null,backupCompletedAt:null,backupReplace:false});
});

/** Sells, the way the shop PC does while offline. */
async function sell(day: string, count: number) {
  const cashier = uuidv7();
  await shop.insert(users).values({
    id: cashier,
    branchId: branch,
    name: "Cashier",
    username: `${day}-cashier`,
    passwordHash: "hash",
    role: "cashier",
  });
  for (let index = 0; index < count; index += 1) {
    await shop.insert(employees).values({
      id: uuidv7(),
      branchId: branch,
      name: `${day}-${index}`,
    });
    await shop.insert(orders).values({
      id: uuidv7(),
      branchId: branch,
      orderNumber: `${day}-${index}`,
      clientRequestId: uuidv7(),
      requestFingerprint: "f".repeat(64),
      cashierId: cashier,
      subtotal: String(10 + index),
      total: String(10 + index),
      cashReceived: String(20 + index),
      changeAmount: "10.00",
    });
  }
}

const upload = () =>
  uploadPending(shop, {
    apiUrl: "https://online.invalid/api",
    deviceToken: token,
    appVersion,
    migrationCheckpoint: checkpoint,
    send: (body) =>
      request(onlineApp)
        .post("/api/device/ingest")
        .set("Authorization", `Device ${token}`)
        .set("X-Cashier-Version", appVersion)
        .send(body)
        .then((response) => {
          if (response.status >= 400)
            throw new Error(`ingest answered ${response.status}`);
          return response.body as { acknowledgedSeqs: number[] };
        }),
  });

/** Drains the whole queue, one batch at a time. */
async function drain() {
  let result = await upload();
  while (result.pending > 0) result = await upload();
  return result;
}

const names = (db: Db, whereBranch = branch) =>
  db
    .select({ name: employees.name })
    .from(employees)
    .where(eq(employees.branchId, whereBranch))
    .orderBy(employees.name)
    .then((rows) => rows.map((row) => row.name));

describe("a PC that was offline for a day", () => {
  it("automatically uploads new data after a restored database reuses old sequences", async () => {
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),"cashier-generation-test-"));
    const server=onlineApp.listen(0,"127.0.0.1");
    await new Promise<void>(resolve=>server.once("listening",resolve));
    const {port}=server.address() as {port:number};
    await shop.delete(branches).where(eq(branches.id,otherBranch));
    const target=owned.find(entry=>entry.db===shop)!;
    const url=loadTestEnvironment({databaseName:target.name});
    const settings=path.join(directory,"settings.env"),manifest=path.join(directory,"manifest.json");
    fs.writeFileSync(settings,`JWT_SECRET=${jwtSecret}\nBRANCH_ID=${branch}\nDEVICE_TOKEN=${token}\nONLINE_API_URL=http://127.0.0.1:${port}/api\nDESKTOP_SYNC_ENABLED=false\n`);
    fs.writeFileSync(manifest,JSON.stringify({version:appVersion,schemaCreatedAt:checkpoint}));
    const first=uuidv7(),next=uuidv7();
    await shop.insert(employees).values({id:first,branchId:branch,name:"Before restore"});
    const errors=vi.spyOn(console,"error").mockImplementation(()=>{});
    let runtime:Awaited<ReturnType<typeof startDesktopApi>>|undefined;
    const start=()=>startDesktopApi(settings,manifest,new AbortController().signal,url,{mysqlBin:"",dataDir:directory});
    try {
      runtime=await start();
      await vi.waitFor(async()=>expect(await names(online)).toEqual(["Before restore"]),{timeout:5000});
      await runtime.close(); runtime=undefined;
      const [backupState]=await shop.select().from(syncState);
      await shop.update(employees).set({name:"Later before restore"}).where(eq(employees.id,first));
      runtime=await start();
      await vi.waitFor(async()=>expect(await names(online)).toEqual(["Later before restore"]),{timeout:5000});
      await runtime.close(); runtime=undefined;
      // Restore an earlier successful backup, including its completed bootstrap
      // marker and older progress/counter; keep the external generation record.
      await shop.update(syncState).set(backupState).where(eq(syncState.id,1));
      await shop.$client.query("DELETE FROM sync_outbox");
      await shop.$client.query(`ALTER TABLE sync_outbox AUTO_INCREMENT=${backupState.lastUploadedSeq+1}`);
      await shop.update(employees).set({name:"After restore"}).where(eq(employees.id,first));
      await shop.insert(employees).values({id:next,branchId:branch,name:"New after restore"});
      runtime=await start();
      await vi.waitFor(async()=>expect(await names(online)).toEqual(["After restore","New after restore"]),{timeout:5000});
    } finally {
      await runtime?.close(); errors.mockRestore();
      await new Promise<void>(resolve=>server.close(()=>resolve()));
      await shop.insert(branches).values({id:otherBranch,name:"Other street"});
      if(!directory.startsWith(path.join(os.tmpdir(),"cashier-generation-test-"))) throw new Error("Unexpected scratch path");
      fs.rmSync(directory,{recursive:true,force:true});
    }
  },60000);
  it("ends up online with exactly the rows it sold", async () => {
    await sell("day-1", 5);

    // Nothing reached online while the PC had no network.
    expect(await names(shop)).toHaveLength(5);
    expect(await names(online)).toHaveLength(0);

    await requeueEverything(shop);
    await drain();

    expect(await names(online)).toEqual(await names(shop));
    expect(await shop.select().from(syncOutbox)).toHaveLength(0);
    const onlineOrders = await online.select().from(orders);
    expect(onlineOrders).toHaveLength(5);
  }, 60_000);

  it("leaves online empty when the queue never leaves the PC", async () => {
    await sell("day-2", 3);

    expect(await names(online)).toHaveLength(0);
  });

  it("records every accepted event so a retry changes nothing", async () => {
    await sell("day-3", 2);
    await requeueEverything(shop);

    const first = await drain();
    const second = await upload();

    expect(second.uploaded).toBe(0);
    expect(second.pending).toBe(0);
    expect(await online.select().from(syncIngestEvents)).toHaveLength(
      first.uploaded,
    );
    expect(await online.select().from(syncIngestRows)).not.toHaveLength(0);
  }, 60_000);

  it("never uploads another branch's rows, even by mistake", async () => {
    await sell("day-5", 1);
    await shop.insert(employees).values({
      id: uuidv7(),
      branchId: otherBranch,
      name: "Wrong branch",
    });
    await requeueEverything(shop);

    // The queue holds another branch's row; ingest refuses the whole batch.
    await expect(upload()).rejects.toThrow();

    expect(await names(online, otherBranch)).toHaveLength(0);
  }, 60_000);

  it("keeps a reopened day in step with what came before it", async () => {
    await sell("day-6", 2);
    await requeueEverything(shop);
    await drain();
    // New sales the next morning, after online already has the first batch.
    await sell("day-7", 3);
    await drain();

    expect(await names(online)).toEqual(await names(shop));
    expect(await names(shop)).toHaveLength(5);
  }, 60_000);

  it("shows nothing new online when the PC has nothing new to send", async () => {
    await sell("day-8", 1);
    await requeueEverything(shop);
    await drain();
    const before = await names(online);

    const result = await upload();

    expect(result).toEqual({ uploaded: 0, pending: 0 });
    expect(await names(online)).toEqual(before);
  }, 60_000);

  it("keeps the online database free of the PC's own queue", async () => {
    await sell("day-9", 2);
    await requeueEverything(shop);
    await drain();

    expect(
      await online.select({ id: syncIngestRows.deviceId }).from(syncIngestRows),
    ).not.toHaveLength(0);
    const [branchRow] = await online
      .select({ name: branches.name })
      .from(branches)
      .where(eq(branches.id, branch));
    expect(branchRow.name).toBe("Main street");
    expect(
      await online.$client.query(
        "SELECT COUNT(*) AS n FROM sync_outbox",
      ).then(([rows]) => Number((rows as Array<{ n: number }>)[0].n)),
    ).toBe(0);
  }, 60_000);
});
