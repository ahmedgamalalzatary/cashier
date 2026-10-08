import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";
import { afterEach, describe, expect, it } from "vitest";
import { closeDb, createDb, type Db } from "../../src/client.js";
import { loadTestEnvironment, migrationsFolder } from "../support/test-env.js";
import {
  DesktopStartupError,
  prepareDesktopDatabase,
  readUpgradeState,
  restoreDesktopBackup,
} from "../../../../apps/api/src/desktop/upgrade.js";

// The bundled client tools; prepared by `pnpm --filter @cashier/desktop prepare:desktop`.
const mysqlBin = path.resolve(
  import.meta.dirname,
  "../../../../apps/desktop/src-tauri/runtime/mysql/bin",
);
const baseline = JSON.parse(
  fs.readFileSync(path.join(migrationsFolder, "meta/_journal.json"), "utf8"),
).entries.at(-1).when as number;
const next = baseline + 60_000;

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function scratchFolder(prefix: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  cleanups.push(() => {
    if (!directory.startsWith(path.join(os.tmpdir(), prefix)))
      throw new Error("Unexpected test directory");
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

/** An owned empty database, dropped after the test. */
async function scratchDatabase() {
  const name = `cashier_upgrade_${process.pid}_${cleanups.length}_test`;
  const owner = await mysql.createConnection(loadTestEnvironment());
  await owner.query("DROP DATABASE IF EXISTS ??", [name]);
  await owner.query("CREATE DATABASE ?? CHARACTER SET utf8mb4", [name]);
  const url = loadTestEnvironment({ databaseName: name });
  const db = createDb(url);
  cleanups.push(async () => {
    await closeDb(db);
    await owner.query("DROP DATABASE ??", [name]);
    await owner.end();
  });
  return { url, db };
}

/** The real baseline plus an optional later migration. */
function migrations(extra?: string) {
  const folder = scratchFolder("cashier-migrations-");
  fs.cpSync(migrationsFolder, folder, { recursive: true });
  if (extra) {
    fs.writeFileSync(path.join(folder, "0001_next.sql"), extra);
    const journalFile = path.join(folder, "meta/_journal.json");
    const journal = JSON.parse(fs.readFileSync(journalFile, "utf8"));
    journal.entries.push({
      idx: 1,
      version: "5",
      when: next,
      tag: "0001_next",
      breakpoints: true,
    });
    fs.writeFileSync(journalFile, JSON.stringify(journal));
  }
  return folder;
}
const working =
  "CREATE TABLE `upgrade_probe` (`id` int PRIMARY KEY);\n--> statement-breakpoint\nINSERT INTO `upgrade_probe` VALUES (1);";
const broken =
  "CREATE TABLE `upgrade_probe` (`id` int PRIMARY KEY);\n--> statement-breakpoint\nINSERT INTO `missing_table` VALUES (1);";

async function tables(db: Db) {
  const [rows] = await db.$client.query<RowDataPacket[]>(
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()",
  );
  return rows.map((row) => String(row.name));
}
async function branchNames(db: Db) {
  const [rows] = await db.$client.query<RowDataPacket[]>(
    "SELECT name FROM branches ORDER BY name",
  );
  return rows.map((row) => String(row.name));
}

/** A database on the baseline holding one branch, as an older Cashier left it. */
async function olderDatabase() {
  const { url, db } = await scratchDatabase();
  const dataDir = scratchFolder("cashier-data-");
  await prepareDesktopDatabase({
    db,
    databaseUrl: url,
    mysqlBin,
    dataDir,
    migrationsFolder: migrations(),
    expected: baseline,
    appVersion: "1.0.0",
  });
  await db.$client.query(
    "INSERT INTO branches (id, name) VALUES ('019a1234-5678-7000-8000-0000000000aa', 'فرع الاختبار')",
  );
  const options = (folder: string, appVersion = "1.1.0") => ({
    db,
    databaseUrl: url,
    mysqlBin,
    dataDir,
    migrationsFolder: folder,
    expected: next,
    appVersion,
  });
  return { db, url, dataDir, options };
}
const backups = (dataDir: string) =>
  fs.existsSync(path.join(dataDir, "backups"))
    ? fs
        .readdirSync(path.join(dataDir, "backups"))
        .filter((name) => name.endsWith(".sql"))
    : [];

describe.skipIf(!fs.existsSync(path.join(mysqlBin, "mysqldump.exe")))(
  "desktop database upgrade (bundled MySQL tools)",
  { timeout: 120_000 },
  () => {
    it("creates a new database without a backup", async () => {
      const { url, db } = await scratchDatabase();
      const dataDir = scratchFolder("cashier-data-");
      await prepareDesktopDatabase({
        db,
        databaseUrl: url,
        mysqlBin,
        dataDir,
        migrationsFolder: migrations(),
        expected: baseline,
        appVersion: "1.0.0",
      });
      expect(await tables(db)).toContain("branches");
      expect(fs.readdirSync(dataDir)).toEqual([]);
    });

    it("does nothing on an ordinary start", async () => {
      const { db, dataDir, options } = await olderDatabase();
      await prepareDesktopDatabase({
        ...options(migrations()),
        expected: baseline,
      });
      expect(backups(dataDir)).toEqual([]);
      expect(await branchNames(db)).toEqual(["فرع الاختبار"]);
    });

    it("backs up, then applies a pending update and keeps five backups", async () => {
      const { db, dataDir, options } = await olderDatabase();
      const folder = path.join(dataDir, "backups");
      fs.mkdirSync(folder);
      for (let index = 0; index < 6; index++) {
        const file = path.join(folder, `pre-old-${index}.sql`);
        fs.writeFileSync(file, "-- Dump completed\n");
        fs.utimesSync(file, index + 1, index + 1);
      }
      let busy = false;

      await prepareDesktopDatabase({
        ...options(migrations(working)),
        onBusy: () => (busy = true),
      });

      expect(busy).toBe(true);
      expect(await tables(db)).toContain("upgrade_probe");
      expect(await branchNames(db)).toEqual(["فرع الاختبار"]);
      const kept = backups(dataDir);
      const created = kept.find((name) =>
        name.startsWith(`pre-${baseline}-to-${next}-`),
      )!;
      expect(created).toBeDefined();
      expect(kept.sort()).toEqual(
        [created, ...[2, 3, 4, 5].map((i) => `pre-old-${i}.sql`)].sort(),
      );
      const dump = fs.readFileSync(path.join(folder, created), "utf8");
      expect(dump).toContain("فرع الاختبار");
      expect(
        fs.readFileSync(path.join(folder, "last-known-good.txt"), "utf8"),
      ).toBe(created);
      expect(readUpgradeState(dataDir)).toBeNull();
    });

    it("recovers from a failed update without retrying the same version", async () => {
      const { db, url, dataDir, options } = await olderDatabase();

      const failure = await prepareDesktopDatabase(
        options(migrations(broken)),
      ).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(DesktopStartupError);
      expect((failure as DesktopStartupError).canRestore).toBe(true);
      const state = readUpgradeState(dataDir)!;
      expect(state).toMatchObject({
        state: "in-progress",
        from: baseline,
        to: next,
        appVersion: "1.1.0",
      });
      expect(await tables(db)).toContain("upgrade_probe"); // half applied

      // the next start neither backs up the half-changed database nor retries
      const before = backups(dataDir);
      await expect(
        prepareDesktopDatabase(options(migrations(broken))),
      ).rejects.toThrow("last update failed");
      expect(backups(dataDir)).toEqual(before);

      await restoreDesktopBackup({ db, databaseUrl: url, mysqlBin, dataDir });
      expect(await tables(db)).not.toContain("upgrade_probe");
      expect(await branchNames(db)).toEqual(["فرع الاختبار"]);
      expect(readUpgradeState(dataDir)).toMatchObject({ state: "restored" });

      await expect(
        prepareDesktopDatabase(options(migrations(broken))),
      ).rejects.toThrow("corrected version");

      await prepareDesktopDatabase(options(migrations(working), "1.1.1"));
      expect(await tables(db)).toContain("upgrade_probe");
      expect(await branchNames(db)).toEqual(["فرع الاختبار"]);
      expect(readUpgradeState(dataDir)).toBeNull();
      expect(fs.existsSync(state.backup)).toBe(true);
    });

    it("updates nothing when the backup cannot be made", async () => {
      const { db, dataDir, options } = await olderDatabase();
      await expect(
        prepareDesktopDatabase({
          ...options(migrations(working)),
          mysqlBin: path.join(dataDir, "no-tools-here"),
        }),
      ).rejects.toThrow("could not back up");
      expect(await tables(db)).not.toContain("upgrade_probe");
      expect(readUpgradeState(dataDir)).toBeNull();
      expect(fs.readdirSync(path.join(dataDir, "backups"))).toEqual([]);
    });

    it("updates nothing when the disk is too full for a backup", async () => {
      const { db, dataDir, options } = await olderDatabase();
      await expect(
        prepareDesktopDatabase({
          ...options(migrations(working)),
          freeSpace: () => 0,
        }),
      ).rejects.toThrow("disk space");
      expect(await tables(db)).not.toContain("upgrade_probe");
      expect(readUpgradeState(dataDir)).toBeNull();
    });
  },
);
