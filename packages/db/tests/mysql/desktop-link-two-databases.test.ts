import type { AddressInfo } from "node:net";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import mysql from "mysql2/promise";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { afterAll, afterEach, beforeAll, describe, expect } from "vitest";
import { branches, devices, linkCodes } from "@cashier/db";
import { closeDb, createDb, type Db } from "../../src/client.js";
import { loadTestEnvironment } from "../support/test-env.js";
import { db } from "../support/api-setup.js";
import { it } from "../support/ids.js";
import { createApp } from "../../../../apps/online-api/src/app.js";
import { authenticateDevice } from "../../../../packages/server-core/src/index.js";
import {
  databaseBranches,
  linkDesktop,
  resumePendingLink,
} from "../../../../apps/api/src/desktop/link.js";

/**
 * F02. The review could not reproduce the whole failure, because the desktop
 * tests mock online and the online tests never hold a local database. This one
 * runs the real desktop code against the real online API over HTTP, with two
 * real databases: the PC's own, and the online one.
 */
const onlineApp = createApp(db, {
  jwtSecret: process.env.JWT_SECRET,
  corsOrigins: ["https://cashier.biscofa.tech"],
});
// The real account and upload routes arrive in 9.3 and 10; this stands in.
onlineApp.get("/probe", authenticateDevice(db), (req, res) => {
  res.json({ branchId: req.device!.branchId });
});

let server: ReturnType<typeof onlineApp.listen>;
let apiUrl: string;
let siteUrl: string;
let directories: string[];
const cleanups: Array<() => Promise<void> | void> = [];

beforeAll(async () => {
  server = onlineApp.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  siteUrl = `http://127.0.0.1:${port}`;
  apiUrl = `${siteUrl}/api`;
  directories = [];
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  for (const directory of directories.splice(0)) {
    if (!directory.startsWith(path.join(os.tmpdir(), "cashier-link-e2e-")))
      throw new Error("Unexpected test directory");
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** A real second database, with the real schema, dropped after the test. */
async function pcDatabase() {
  const name = `cashier_link_pc_${process.pid}_${cleanups.length}_test`;
  const owner = await mysql.createConnection(loadTestEnvironment());
  await owner.query("DROP DATABASE IF EXISTS ??", [name]);
  await owner.query("CREATE DATABASE ?? CHARACTER SET utf8mb4", [name]);
  const url = loadTestEnvironment({ databaseName: name });
  const local = createDb(url);
  await migrate(local, {
    migrationsFolder: path.resolve(import.meta.dirname, "../../drizzle"),
  });
  cleanups.push(async () => {
    await closeDb(local);
    await owner.query("DROP DATABASE ??", [name]);
    await owner.end();
  });
  return local;
}

function settingsFile() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cashier-link-e2e-"));
  directories.push(directory);
  const file = path.join(directory, "settings.env");
  fs.writeFileSync(file, `ONLINE_API_URL="${apiUrl}"\n`);
  return file;
}

async function onlineBranch(name: string) {
  const [branch] = await db
    .insert(branches)
    .values({ name })
    .$returningId();
  return branch.id;
}

async function issueCode(branchId: string, code: string) {
  await db
    .insert(linkCodes)
    .values({
      codeHash: sha256(code),
      branchId,
      expiresAt: new Date(Date.now() + 60 * 60_000),
    });
  return code;
}

/** Whether online still accepts this PC's token. */
const probeWith = (token: string) =>
  fetch(`${siteUrl}/probe`, {
    headers: { Authorization: `Device ${token}` },
  }).then((response) => response.status);

const deviceOf = (branchId: string) =>
  db
    .select()
    .from(devices)
    .where(eq(devices.branchId, branchId))
    .then((rows) => rows[0]);

const usedAtOf = (code: string) =>
  db
    .select({ usedAt: linkCodes.usedAt })
    .from(linkCodes)
    .where(eq(linkCodes.codeHash, sha256(code)))
    .then((rows) => rows[0]?.usedAt ?? null);

const localNames = (local: Db) =>
  local
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .then((rows) => rows.map((row) => `${row.id} ${row.name}`).sort());

/** Links a PC's branch so it has a device of its own, and returns its token. */
async function onlineDeviceFor(branchId: string) {
  const code = await issueCode(branchId, "ABCD2345");
  const answer = await fetch(`${apiUrl}/device/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  expect(answer.status).toBe(201);
  return (await answer.json()).deviceToken as string;
}

describe("a PC holding one branch tries another branch's code", () => {
  // each test builds a real database from the real schema
  it(
    "changes nothing online or locally",
    async () => {
      const local = await pcDatabase();
      const mine = await onlineBranch("فرع هذا الجهاز");
      const theirs = await onlineBranch("فرع غير هذا الجهاز");
      // this branch already has a working PC of its own
      const theirToken = await onlineDeviceFor(theirs);
      const before = await deviceOf(theirs);
      const spare = await issueCode(theirs, "WXYZ6789");
      await databaseBranches(local).save({ id: mine, name: "فرع هذا الجهاز" });
      const file = settingsFile();

      await expect(
        linkDesktop({
          settingsFile: file,
          code: spare,
          appVersion: "0.3.0",
          branches: databaseBranches(local),
        }),
      ).rejects.toThrow("كود الربط غير صحيح");

      // the code was never spent, and the other PC still works
      expect(await usedAtOf(spare)).toBeNull();
      expect(await deviceOf(theirs)).toEqual(before);
      expect(await probeWith(theirToken)).toBe(200);

      // and this PC kept exactly what it had
      expect(await localNames(local)).toEqual([`${mine} فرع هذا الجهاز`]);
      expect(fs.readFileSync(file, "utf8")).toBe(`ONLINE_API_URL="${apiUrl}"\n`);
    },
    60_000,
  );

  it(
    "links normally when the code is for the branch the PC already holds",
    async () => {
      const local = await pcDatabase();
      const mine = await onlineBranch("فرع هذا الجهاز");
      const code = await issueCode(mine, "QRST2345");
      const file = settingsFile();
      await databaseBranches(local).save({ id: mine, name: "الاسم القديم" });

      await expect(
        linkDesktop({
          settingsFile: file,
          code,
          appVersion: "0.3.0",
          branches: databaseBranches(local),
        }),
      ).resolves.toMatchObject({ id: mine });

      expect(await localNames(local)).toEqual([`${mine} فرع هذا الجهاز`]);
      const settings = fs.readFileSync(file, "utf8");
      expect(settings).toContain(`BRANCH_ID="${mine}"`);
      const token = /DEVICE_TOKEN="([^"]+)"/.exec(settings)?.[1];
      expect(await probeWith(token!)).toBe(200);
    },
    60_000,
  );

  it(
    "links an empty PC without naming any branch",
    async () => {
      const local = await pcDatabase();
      const target = await onlineBranch("فرع جديد");
      const code = await issueCode(target, "JKTN5678");
      const file = settingsFile();

      await expect(
        linkDesktop({
          settingsFile: file,
          code,
          appVersion: "0.3.0",
          branches: databaseBranches(local),
        }),
      ).resolves.toMatchObject({ id: target });

      expect(await localNames(local)).toEqual([`${target} فرع جديد`]);
      expect(await usedAtOf(code)).not.toBeNull();
    },
    60_000,
  );

  it(
    "resumes a saved link on start without anyone typing a code",
    async () => {
      const local = await pcDatabase();
      const target = await onlineBranch("فرع الاستئناف");
      const code = await issueCode(target, "RSUM6789");
      const file = settingsFile();
      const record = path.join(path.dirname(file), "pending-link.json");
      // online accepted and wrote its answer down, then Cashier stopped
      // before the branch row and the settings were finished
      const online = await fetch(`${apiUrl}/device/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      expect(online.status).toBe(201);
      const answer = (await online.json()) as { deviceToken: string };
      fs.writeFileSync(
        record,
        JSON.stringify({
          branchId: target,
          branchName: "فرع الاستئناف",
          deviceToken: answer.deviceToken,
        }),
      );

      // the shell's next start runs this with no code at all
      const resumed = await resumePendingLink({
        settingsFile: file,
        branches: databaseBranches(local),
      });

      expect(resumed).toMatchObject({ id: target });
      expect(await localNames(local)).toEqual([`${target} فرع الاستئناف`]);
      const settings = fs.readFileSync(file, "utf8");
      expect(settings).toContain(`BRANCH_ID="${target}"`);
      expect(settings).toContain(`DEVICE_TOKEN="${answer.deviceToken}"`);
      expect(fs.existsSync(record)).toBe(false);
      // the code was spent by the attempt that was interrupted, not by the resume
      expect(await usedAtOf(code)).not.toBeNull();
    },
    60_000,
  );

  it(
    "reports a start with nothing left to finish",
    async () => {
      const local = await pcDatabase();
      const file = settingsFile();
      fs.writeFileSync(file, `ONLINE_API_URL="${apiUrl}"\n`);

      await expect(
        resumePendingLink({
          settingsFile: file,
          branches: databaseBranches(local),
        }),
      ).resolves.toBeNull();
      expect(await localNames(local)).toEqual([]);
    },
    60_000,
  );

  it(
    "clears a record the settings already finished when the start looks",
    async () => {
      const local = await pcDatabase();
      const target = await onlineBranch("فرع منتهٍ");
      const code = await issueCode(target, "DNEE2345");
      const file = settingsFile();
      await linkDesktop({
        settingsFile: file,
        code,
        appVersion: "0.3.0",
        branches: databaseBranches(local),
      });
      // the removal of the record was itself lost: same answer, still on disk
      const record = path.join(path.dirname(file), "pending-link.json");
      const written = fs.readFileSync(file, "utf8");
      const branchId = /BRANCH_ID="([^"]+)"/.exec(written)![1];
      const deviceToken = /DEVICE_TOKEN="([^"]+)"/.exec(written)![1];
      fs.writeFileSync(
        record,
        JSON.stringify({
          branchId,
          branchName: "فرع منتهٍ",
          deviceToken,
        }),
      );

      // the settings already carry the link, so there is nothing to resume
      await expect(
        resumePendingLink({
          settingsFile: file,
          branches: databaseBranches(local),
        }),
      ).resolves.toBeNull();
      expect(fs.existsSync(record)).toBe(false);
      expect(await localNames(local)).toEqual([`${target} فرع منتهٍ`]);
    },
    60_000,
  );

  it(
    "says what to do when the answer was lost after online had already committed",
    async () => {
      const local = await pcDatabase();
      const target = await onlineBranch("فرع ضائع");
      const lost = await issueCode(target, "WXYZ6789");
      // The real endpoint commits and hands out a token; this PC never sees it.
      // There is no local record to resume from, and the code is now spent.
      const lostAnswer = await fetch(`${apiUrl}/device/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: lost }),
      });
      expect(lostAnswer.status).toBe(201);

      const file = settingsFile();
      await expect(
        linkDesktop({
          settingsFile: file,
          code: lost,
          appVersion: "0.3.0",
          branches: databaseBranches(local),
        }),
      ).rejects.toThrow("كود ربط جديد");

      // and the honest advice is right: a fresh code is what actually works
      expect(await localNames(local)).toEqual([]);
      expect(fs.readFileSync(file, "utf8")).toBe(`ONLINE_API_URL="${apiUrl}"\n`);
      const replacement = await issueCode(target, "MNPQ2345");
      await expect(
        linkDesktop({
          settingsFile: file,
          code: replacement,
          appVersion: "0.3.0",
          branches: databaseBranches(local),
        }),
      ).resolves.toMatchObject({ id: target });
      // the spent code is still spent; the test never made it reusable
      expect(await usedAtOf(lost)).not.toBeNull();
      expect(await usedAtOf(replacement)).not.toBeNull();
    },
    60_000,
  );
});