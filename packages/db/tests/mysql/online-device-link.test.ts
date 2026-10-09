import { eq } from "drizzle-orm";
import { branches, devices, linkCodes } from "@cashier/db";
import { createHash } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect } from "vitest";
import { it } from "../support/ids.js";
import { createApp } from "../../../../apps/online-api/src/app.js";
import {
  authenticateDevice,
  errorHandler,
} from "../../../../packages/server-core/src/index.js";
import { db } from "../support/api-setup.js";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const onlineApp = createApp(db, {
  jwtSecret: process.env.JWT_SECRET,
  corsOrigins: ["https://cashier.biscofa.tech"],
});

// The device routes arrive in 9.3 and 10; this probe stands in for them.
const deviceProbe = express()
  .get("/probe", authenticateDevice(db), (req, res) => {
    res.json({ branchId: req.device!.branchId });
  })
  .use(errorHandler);

async function createBranch(name: string, isActive = true) {
  const [branch] = await db
    .insert(branches)
    .values({ name, isActive })
    .$returningId();
  return branch.id;
}

/** Stores a code the way the link-code screen does: only its hash. */
async function issueCode(
  branchId: string,
  code: string,
  expiresAt = new Date(Date.now() + 60 * 60_000),
) {
  await db
    .insert(linkCodes)
    .values({ codeHash: sha256(code), branchId, expiresAt });
}

const link = (code: string) =>
  request(onlineApp).post("/api/device/link").send({ code });

const linkWithVersion = (code: string, version?: string) => {
  const pending = request(onlineApp).post("/api/device/link").send({ code });
  return version === undefined
    ? pending
    : pending.set("X-Cashier-Version", version);
};

const deviceRows = (branchId: string) =>
  db.select().from(devices).where(eq(devices.branchId, branchId));

describe("online device link", () => {
  it("links a PC with a fresh code and keeps only the token's hash", async () => {
    const branchId = await createBranch("فرع الربط");
    await issueCode(branchId, "ABCD2345");

    const response = await link("ABCD2345").expect(201);

    expect(response.body.branch).toEqual({ id: branchId, name: "فرع الربط" });
    const [device] = await deviceRows(branchId);
    expect(device.tokenHash).toBe(sha256(response.body.deviceToken));
    expect(JSON.stringify(device)).not.toContain(response.body.deviceToken);
    const [code] = await db
      .select()
      .from(linkCodes)
      .where(eq(linkCodes.codeHash, sha256("ABCD2345")));
    expect(code.usedAt).not.toBeNull();
  });

  it("records which version of Cashier the PC runs when it links", async () => {
    const branchId = await createBranch("فرع إصدار");
    await issueCode(branchId, "ABCD2345");

    await linkWithVersion("ABCD2345", "0.3.0").expect(201);

    const [device] = await deviceRows(branchId);
    expect(device.appVersion).toBe("0.3.0");
  });

  it("keeps an oversized version header to a bounded length", async () => {
    const branchId = await createBranch("فرع إصدار طويل");
    await issueCode(branchId, "ABCD2345");

    await linkWithVersion("ABCD2345", "9".repeat(500)).expect(201);

    const [device] = await deviceRows(branchId);
    expect(device.appVersion).toBe("9".repeat(64));
  });

  it("links without a version header", async () => {
    const branchId = await createBranch("فرع بلا إصدار");
    await issueCode(branchId, "ABCD2345");

    await linkWithVersion("ABCD2345").expect(201);

    const [device] = await deviceRows(branchId);
    expect(device.appVersion).toBeNull();
  });

  it("accepts a code only once", async () => {
    const branchId = await createBranch("فرع مرة واحدة");
    await issueCode(branchId, "ABCD2345");
    await link("ABCD2345").expect(201);

    await link("ABCD2345").expect(400);

    expect(await deviceRows(branchId)).toHaveLength(1);
  });

  it("links only one of two PCs that send the same code at once", async () => {
    const branchId = await createBranch("فرع سباق");
    await issueCode(branchId, "ABCD2345");

    const statuses = (
      await Promise.all([link("ABCD2345"), link("ABCD2345")])
    ).map((response) => response.status);

    expect(statuses.sort()).toEqual([201, 400]);
    expect(await deviceRows(branchId)).toHaveLength(1);
  });

  it("refuses an expired code", async () => {
    const branchId = await createBranch("فرع منتهي");
    await issueCode(branchId, "ABCD2345", new Date(Date.now() - 1000));

    await link("ABCD2345").expect(400);

    expect(await deviceRows(branchId)).toHaveLength(0);
  });

  it("refuses a code that was never issued", async () => {
    await link("ZZZZ9999").expect(400);
  });

  it("refuses a code whose branch was archived after it was made", async () => {
    const branchId = await createBranch("فرع أُرشف");
    await issueCode(branchId, "ABCD2345");
    await db
      .update(branches)
      .set({ isActive: false })
      .where(eq(branches.id, branchId));

    await link("ABCD2345").expect(400);
  });

  it("replaces the branch's old PC when it is linked again", async () => {
    const branchId = await createBranch("فرع جهاز جديد");
    await issueCode(branchId, "ABCD2345");
    const oldPc = (await link("ABCD2345").expect(201)).body.deviceToken;
    await issueCode(branchId, "WXYZ6789");

    const newPc = (await link("WXYZ6789").expect(201)).body.deviceToken;

    const rows = await deviceRows(branchId);
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(sha256(newPc));
    await request(deviceProbe)
      .get("/probe")
      .set("Authorization", `Device ${oldPc}`)
      .expect(401);
    await request(deviceProbe)
      .get("/probe")
      .set("Authorization", `Device ${newPc}`)
      .expect(200, { branchId });
  });
});

describe("device sign-in", () => {
  it("refuses a request without a device token", async () => {
    await request(deviceProbe).get("/probe").expect(401);
    await request(deviceProbe)
      .get("/probe")
      .set("Authorization", "Bearer something")
      .expect(401);
    await request(deviceProbe)
      .get("/probe")
      .set("Authorization", "Device not-a-real-token")
      .expect(401);
  });

  it("records when the PC was last seen and which version it runs", async () => {
    const branchId = await createBranch("فرع آخر ظهور");
    await issueCode(branchId, "ABCD2345");
    const token = (await link("ABCD2345").expect(201)).body.deviceToken;

    await request(deviceProbe)
      .get("/probe")
      .set("Authorization", `Device ${token}`)
      .set("X-Cashier-Version", "0.3.0")
      .expect(200);

    const [device] = await deviceRows(branchId);
    expect(device.appVersion).toBe("0.3.0");
    expect(device.lastSeenAt).not.toBeNull();
  });
});
