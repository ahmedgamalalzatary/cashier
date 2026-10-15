import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  branches,
  devices,
  employees,
  linkCodes,
  syncIngestRows,
} from "@cashier/db";
import request from "supertest";
import { createApp } from "../../../../apps/online-api/src/app.js";
import { db } from "./api-setup.js";

export const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export const onlineApp = createApp(db, {
  jwtSecret: process.env.JWT_SECRET,
  corsOrigins: ["https://cashier.biscofa.tech"],
});

export const otherBranchId = randomUUID();

/** The migration checkpoint the server is on; refreshed before every test. */
export const ingestState = { checkpoint: 0 };

export async function serverCheckpoint() {
  const [rows] = await db.$client.query(
    "SELECT MAX(created_at) AS checkpoint FROM __drizzle_migrations",
  );
  return Number((rows as Array<{ checkpoint: number | string }>)[0].checkpoint);
}

/** Recomputes the checkpoint the default `batch` sends; call from beforeEach. */
export async function refreshCheckpoint() {
  ingestState.checkpoint = await serverCheckpoint();
}

let linkCounter = 0;
const codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const nextCode = () => {
  linkCounter += 1;
  let code = "";
  let value = linkCounter * 7919;
  for (let index = 0; index < 8; index += 1) {
    code += codeAlphabet[value % codeAlphabet.length];
    value = Math.floor(value / codeAlphabet.length) + index * 31 + 13;
  }
  return code;
};

export async function linkDevice(name: string) {
  const [branch] = await db.insert(branches).values({ name }).$returningId();
  const code = nextCode();
  await db.insert(linkCodes).values({
    codeHash: sha256(code),
    branchId: branch.id,
    expiresAt: new Date(Date.now() + 60 * 60_000),
  });
  const response = await request(onlineApp)
    .post("/api/device/link")
    .send({ code })
    .expect(201);
  return { branchId: branch.id, token: response.body.deviceToken as string };
}

export type IngestRow = {
  seq: number;
  table: string;
  op: "upsert" | "delete";
  pk: Record<string, unknown>;
  row?: Record<string, unknown> | null;
};

export const ingest = (token: string, body: Record<string, unknown>) =>
  request(onlineApp)
    .post("/api/device/ingest")
    .set("Authorization", `Device ${token}`)
    .send(body);

export const batch = (
  rows: IngestRow[],
  overrides: Record<string, unknown> = {},
) => ({
  appVersion: "0.3.0",
  migrationCheckpoint: ingestState.checkpoint,
  rows,
  ...overrides,
});

export const employeeRow = (branchId: string, id: string, name: string) => ({
  id,
  branch_id: branchId,
  name,
  phone: null,
  job_title: null,
  hire_date: null,
  pay_rate: null,
  notes: null,
  is_active: 1,
  created_at: "2026-10-09 12:34:56",
});

export const linkDeviceFor = (branchId: string) => {
  const code = nextCode();
  return db
    .insert(linkCodes)
    .values({
      codeHash: sha256(code),
      branchId,
      expiresAt: new Date(Date.now() + 60 * 60_000),
    })
    .then(() => request(onlineApp).post("/api/device/link").send({ code }));
};

export const employeeNames = (branchId: string) =>
  db
    .select({ name: employees.name })
    .from(employees)
    .where(eq(employees.branchId, branchId))
    .then((rows) => rows.map((row) => row.name).sort());

export const outboxRows = () =>
  db.$client
    .query("SELECT * FROM sync_outbox")
    .then(([rows]) => rows as unknown[]);

export const deviceIdFor = async (branchId: string) =>
  (await db.select().from(devices).where(eq(devices.branchId, branchId)))[0].id;

export const lastUploadAt = async (branchId: string) =>
  (await db.select().from(devices).where(eq(devices.branchId, branchId)))[0]
    .lastUploadAt;

export { syncIngestRows };
