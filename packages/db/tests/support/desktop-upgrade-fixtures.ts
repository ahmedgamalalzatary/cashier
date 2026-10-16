import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";
import { afterEach } from "vitest";
import { closeDb, createDb, type Db } from "../../src/client.js";
import { loadTestEnvironment } from "./test-env.js";
import { prepareDesktopDatabase } from "../../../../apps/api/src/desktop/upgrade.js";

// The bundled client tools; prepared by `pnpm --filter @cashier/desktop prepare:desktop`.
export const mysqlBin = path.resolve(
  import.meta.dirname,
  "../../../../apps/desktop/src-tauri/runtime/mysql/bin",
);
// A one-table starting schema keeps these tests light; they prove the backup,
// update and restore logic, not the real schema (the desktop smoke covers that).
export const baseline = 1_700_000_000_000;
export const next = baseline + 60_000;

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

export function scratchFolder(prefix: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  cleanups.push(() => {
    if (!directory.startsWith(path.join(os.tmpdir(), prefix)))
      throw new Error("Unexpected test directory");
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

/** An owned empty database, dropped after the test. */
export async function scratchDatabase() {
  const name = `cashier_upgrade_${process.pid}_${randomUUID().replaceAll("-", "")}_test`;
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
export function migrations(extra?: string) {
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

export const working =
  "CREATE TABLE `upgrade_probe` (`id` int PRIMARY KEY);\n--> statement-breakpoint\nINSERT INTO `upgrade_probe` VALUES (1);";
export const broken =
  "CREATE TABLE `upgrade_probe` (`id` int PRIMARY KEY);\n--> statement-breakpoint\nINSERT INTO `missing_table` VALUES (1);";

export async function tables(db: Db) {
  const [rows] = await db.$client.query<RowDataPacket[]>(
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()",
  );
  return rows.map((row) => String(row.name));
}
export async function branchNames(db: Db) {
  const [rows] = await db.$client.query<RowDataPacket[]>(
    "SELECT name FROM branches ORDER BY name",
  );
  return rows.map((row) => String(row.name));
}

/** A database on the baseline holding one branch, as an older Cashier left it. */
export async function olderDatabase() {
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

export const backups = (dataDir: string) =>
  fs.existsSync(path.join(dataDir, "backups"))
    ? fs
        .readdirSync(path.join(dataDir, "backups"))
        .filter((name) => name.endsWith(".sql"))
    : [];

/**
 * One migration that never finishes. The database is left holding its table
 * with no record of the migration at all, which is the state a power cut
 * during a first installation produces.
 */
export function blockingMigrations(probe = "bootstrap_probe") {
  const folder = scratchFolder("cashier-migrations-");
  fs.mkdirSync(path.join(folder, "meta"));
  fs.writeFileSync(
    path.join(folder, "0000_base.sql"),
    `CREATE TABLE \`${probe}\` (\`id\` int PRIMARY KEY);\n--> statement-breakpoint\nSELECT SLEEP(120);`,
  );
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
export function startPreparation(
  url: string,
  dataDir: string,
  migrationsFolder: string,
  expected: number,
) {
  const script = path.join(scratchFolder("cashier-child-"), "prepare.mjs");
  fs.writeFileSync(
    script,
    [
      `const [upgrade, client, dir, folder, want, bin] = process.argv.slice(2);`,
      `const databaseUrl = process.env.CASHIER_TEST_DATABASE_URL;`,
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
      dataDir,
      migrationsFolder,
      String(expected),
      mysqlBin,
    ],
    {
      stdio: "ignore",
      windowsHide: true,
      // the workspace packages resolve to their sources, as the app runs them;
      // the database URL travels in the environment so the password never
      // appears in the command line, where any local process could read it
      env: {
        ...process.env,
        NODE_OPTIONS: "--conditions=development",
        CASHIER_TEST_DATABASE_URL: url,
      },
    },
  );
}

/** Waits for the child's first table, which is where the kill must land. */
export async function waitForTable(db: Db, name: string, child: ChildProcess) {
  for (let attempt = 0; attempt < 300; attempt++) {
    if ((await tables(db)).includes(name)) return;
    if (child.exitCode !== null)
      throw new Error("the child finished too early");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`the child never created ${name}`);
}

export async function kill(child: ChildProcess) {
  child.kill();
  await new Promise((resolve) => child.once("exit", resolve));
}
