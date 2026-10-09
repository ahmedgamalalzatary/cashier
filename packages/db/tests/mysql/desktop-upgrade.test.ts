import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";
import { afterEach, describe, expect, it } from "vitest";
import { closeDb, createDb, type Db } from "../../src/client.js";
import { loadTestEnvironment } from "../support/test-env.js";
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
// A one-table starting schema keeps these tests light; they prove the backup,
// update and restore logic, not the real schema (the desktop smoke covers that).
const baseline = 1_700_000_000_000;
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

/** A small baseline plus an optional later migration, in drizzle's layout. */
function migrations(extra?: string) {
  const folder = scratchFolder("cashier-migrations-");
  fs.mkdirSync(path.join(folder, "meta"));
  fs.writeFileSync(
    path.join(folder, "0000_base.sql"),
    "CREATE TABLE `branches` (`id` char(36) PRIMARY KEY, `name` varchar(191) NOT NULL);",
  );
  const entries = [
    {
      idx: 0,
      version: "5",
      when: baseline,
      tag: "0000_base",
      breakpoints: true,
    },
  ];
  if (extra) {
    fs.writeFileSync(path.join(folder, "0001_next.sql"), extra);
    entries.push({
      idx: 1,
      version: "5",
      when: next,
      tag: "0001_next",
      breakpoints: true,
    });
  }
  fs.writeFileSync(
    path.join(folder, "meta/_journal.json"),
    JSON.stringify({ version: "7", dialect: "mysql", entries }),
  );
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

/** A migration that creates a table and then waits, so the parent can act. */
const blocking =
  "CREATE TABLE `bootstrap_probe` (`id` int PRIMARY KEY);\n--> statement-breakpoint\nSELECT SLEEP(120);";

/**
 * One migration that never finishes. The database is left holding its table
 * with no record of the migration at all, which is the state a power cut
 * during a first installation produces.
 */
function blockingMigrations() {
  const folder = scratchFolder("cashier-migrations-");
  fs.mkdirSync(path.join(folder, "meta"));
  fs.writeFileSync(path.join(folder, "0000_base.sql"), blocking);
  fs.writeFileSync(
    path.join(folder, "meta/_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "mysql",
      entries: [
        {
          idx: 0,
          version: "5",
          when: baseline,
          tag: "0000_base",
          breakpoints: true,
        },
      ],
    }),
  );
  return folder;
}

const upgradeSource = path
  .resolve(import.meta.dirname, "../../../../apps/api/src/desktop/upgrade.ts")
  .replace(/\\/g, "/");
const dbSource = path
  .resolve(import.meta.dirname, "../../src/client.ts")
  .replace(/\\/g, "/");
const tsx = path.resolve(
  import.meta.dirname,
  "../../../../apps/api/node_modules/tsx/dist/cli.mjs",
);

/** Runs the real preparation in another process, so it can be killed mid-way. */
function startPreparation(
  url: string,
  dataDir: string,
  migrationsFolder: string,
  expected: number,
) {
  const script = path.join(scratchFolder("cashier-child-"), "prepare.mjs");
  fs.writeFileSync(
    script,
    [
      `const [upgrade, client, databaseUrl, dir, folder, want, bin] = process.argv.slice(2);`,
      `const { prepareDesktopDatabase } = await import(\`file:///${upgradeSource}\`);`,
      `const { createDb } = await import(\`file:///${dbSource}\`);`,
      `await prepareDesktopDatabase({ db: createDb(databaseUrl), databaseUrl, mysqlBin: bin, dataDir: dir, migrationsFolder: folder, expected: Number(want), appVersion: "1.0.0" });`,
    ].join("\n"),
  );
  return spawn(
    process.execPath,
    [
      tsx,
      script,
      upgradeSource,
      dbSource,
      url,
      dataDir,
      migrationsFolder,
      String(expected),
      mysqlBin,
    ],
    {
      stdio: "ignore",
      windowsHide: true,
      // the workspace packages resolve to their sources, as the app runs them
      env: { ...process.env, NODE_OPTIONS: "--conditions=development" },
    },
  );
}

/** Waits for the child's first table, which is where the kill must land. */
async function waitForTable(db: Db, name: string, child: ChildProcess) {
  for (let attempt = 0; attempt < 300; attempt++) {
    if ((await tables(db)).includes(name)) return;
    if (child.exitCode !== null) throw new Error("the child finished too early");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`the child never created ${name}`);
}

async function kill(child: ChildProcess) {
  child.kill();
  await new Promise((resolve) => child.once("exit", resolve));
}

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

/**
 * The fresh path runs without a backup, so an interrupted first installation
 * has to be recognised as ours rather than as somebody else's tables.
 */
describe.skipIf(!fs.existsSync(path.join(mysqlBin, "mysqldump.exe")))(
  "an interrupted first installation",
  { timeout: 120_000 },
  () => {
    const fresh = async () => {
      const { url, db } = await scratchDatabase();
      return { url, db, dataDir: scratchFolder("cashier-data-") };
    };
    const prepare = (
      url: string,
      db: Db,
      dataDir: string,
      folder: string,
      appVersion = "1.0.0",
    ) =>
      prepareDesktopDatabase({
        db,
        databaseUrl: url,
        mysqlBin,
        dataDir,
        migrationsFolder: folder,
        expected: baseline,
        appVersion,
      });

    /** Starts a first installation and kills it once its only table exists. */
    const interruptFirstInstallation = async (
      url: string,
      db: Db,
      dataDir: string,
    ) => {
      const child = startPreparation(
        url,
        dataDir,
        blockingMigrations(),
        baseline,
      );
      await waitForTable(db, "bootstrap_probe", child);
      await kill(child);
      // the power-cut state: our table exists, but nothing was ever recorded
      expect(await tables(db)).toContain("bootstrap_probe");
      const [recorded] = await db.$client.query<RowDataPacket[]>(
        "SELECT created_at FROM __drizzle_migrations",
      );
      expect(recorded).toEqual([]);
    };

    it("recovers on the next start instead of demanding support", async () => {
      const { url, db, dataDir } = await fresh();
      await interruptFirstInstallation(url, db, dataDir);

      await prepare(url, db, dataDir, migrations());

      expect(await tables(db)).toEqual(["__drizzle_migrations", "branches"]);
    });

    it("keeps nothing of the abandoned bootstrap and leaves no trace of it", async () => {
      const { url, db, dataDir } = await fresh();
      await interruptFirstInstallation(url, db, dataDir);

      await prepare(url, db, dataDir, migrations());

      expect(await tables(db)).not.toContain("bootstrap_probe");
      expect(await tables(db)).not.toContain("__cashier_fresh_bootstrap");
      expect(fs.readdirSync(dataDir)).toEqual([]);
    });

    it("starts cleanly once more after the recovered database exists", async () => {
      const { url, db, dataDir } = await fresh();
      await interruptFirstInstallation(url, db, dataDir);
      await prepare(url, db, dataDir, migrations());
      await db.$client.query(
        "INSERT INTO branches (id, name) VALUES ('019a1234-5678-7000-8000-0000000000bb', 'فرع بعد الإنشاء')",
      );

      await prepare(url, db, dataDir, migrations(), "1.0.1");

      expect(await branchNames(db)).toEqual(["فرع بعد الإنشاء"]);
    });

    it("keeps a database whose first installation finished before the marker was cleared", async () => {
      const { url, db, dataDir } = await fresh();
      await prepare(url, db, dataDir, migrations());
      await db.$client.query(
        "INSERT INTO branches (id, name) VALUES ('019a1234-5678-7000-8000-0000000000cc', 'فرع محفوظ')",
      );
      // the marker outlived the migration that finished
      await db.$client.query(
        "CREATE TABLE __cashier_fresh_bootstrap (id int PRIMARY KEY, database_name varchar(64) NOT NULL, expected bigint NOT NULL, app_version varchar(32) NOT NULL)",
      );
      await db.$client.query(
        `INSERT INTO __cashier_fresh_bootstrap VALUES (1, '${new URL(url).pathname.slice(1)}', ${baseline}, '1.0.0')`,
      );

      await prepare(url, db, dataDir, migrations());

      expect(await branchNames(db)).toEqual(["فرع محفوظ"]);
      expect(await tables(db)).not.toContain("__cashier_fresh_bootstrap");
    });

    it("refuses a populated database that carries no marker, and touches nothing", async () => {
      const { url, db, dataDir } = await fresh();
      await db.$client.query(
        "CREATE TABLE somebody_elses (id int PRIMARY KEY, note varchar(50))",
      );
      await db.$client.query("INSERT INTO somebody_elses VALUES (1, 'مهم')");

      await expect(prepare(url, db, dataDir, migrations())).rejects.toThrow(
        "no record of its updates",
      );

      expect(await tables(db)).toContain("somebody_elses");
      const [rows] = await db.$client.query<RowDataPacket[]>(
        "SELECT note FROM somebody_elses",
      );
      expect(rows.map((row) => String(row.note))).toEqual(["مهم"]);
      expect(fs.readdirSync(dataDir)).toEqual([]);
    });

    it("refuses a damaged marker rather than dropping data it cannot vouch for", async () => {
      const { url, db, dataDir } = await fresh();
      await db.$client.query(
        "CREATE TABLE __cashier_fresh_bootstrap (id int PRIMARY KEY, database_name varchar(64) NOT NULL, expected bigint NOT NULL, app_version varchar(32) NOT NULL)",
      );
      await db.$client.query(
        "INSERT INTO __cashier_fresh_bootstrap VALUES (1, 'another_database', 1, '1.0.0')",
      );
      await db.$client.query(
        "CREATE TABLE real_business (id int PRIMARY KEY)",
      );

      await expect(
        prepare(url, db, dataDir, migrations()),
      ).rejects.toThrow(/support/i);

      expect(await tables(db)).toContain("real_business");
    });

    it("starts cleanly again after a first installation fails outright", async () => {
      const { url, db, dataDir } = await fresh();
      const brokenFirst =
        "CREATE TABLE `half_built` (`id` int PRIMARY KEY);\n--> statement-breakpoint\nINSERT INTO `missing_table` VALUES (1);";
      const brokenFolder = scratchFolder("cashier-migrations-");
      fs.mkdirSync(path.join(brokenFolder, "meta"));
      fs.writeFileSync(path.join(brokenFolder, "0000_base.sql"), brokenFirst);
      fs.writeFileSync(
        path.join(brokenFolder, "meta/_journal.json"),
        JSON.stringify({
          version: "7",
          dialect: "mysql",
          entries: [
            {
              idx: 0,
              version: "5",
              when: baseline,
              tag: "0000_base",
              breakpoints: true,
            },
          ],
        }),
      );

      await expect(
        prepare(url, db, dataDir, brokenFolder),
      ).rejects.toThrow("could not create its database");
      expect(await tables(db)).toEqual([]);

      await prepare(url, db, dataDir, migrations());

      expect(await tables(db)).toEqual(["__drizzle_migrations", "branches"]);
    });
  },
);
