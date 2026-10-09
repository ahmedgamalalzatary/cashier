import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import type { RowDataPacket } from "mysql2/promise";
import { migrate } from "drizzle-orm/mysql2/migrator";
import type { Db } from "@cashier/db";

/** A startup stop with a plain message; `canRestore` offers "Restore backup". */
export class DesktopStartupError extends Error {
  constructor(
    message: string,
    readonly canRestore = false,
  ) {
    super(message);
  }
}

export type UpgradeState = {
  state: "in-progress" | "restored";
  from: number;
  to: number;
  appVersion: string;
  backup: string;
};

const STATE_FILE = "upgrade-in-progress.json";
const KEPT_BACKUPS = 5;
const LAST_KNOWN_GOOD = "last-known-good.txt";
/**
 * Written before the first schema change of a brand new database and removed
 * once the migrations finish. MySQL commits each CREATE TABLE on its own, so a
 * power cut can leave the tables of a first installation behind with no record
 * of the migration; only this table says that those tables are ours to discard.
 */
const FRESH_MARKER = "__cashier_fresh_bootstrap";

/** What the fresh-installation marker says about this database. */
export type FreshMarker =
  | { kind: "none" }
  | { kind: "damaged" }
  /**
   * Ours, and rebuilding it is permitted only when `expected` is null (the
   * claim was never recorded, so nothing had been created yet) or the database
   * has not yet reached the checkpoint the claim was written for.
   */
  | { kind: "owned"; expected: number | null };

export type UpgradePlan =
  { kind: "ready" } | { kind: "fresh" } | { kind: "upgrade"; from: number };

/** Decides what startup may do with the database; throws when it must stop. */
export function planUpgrade(input: {
  current: number | null;
  hasTables: boolean;
  known: number[];
  expected: number;
  state: UpgradeState | null;
  appVersion: string;
  fresh?: FreshMarker;
}): UpgradePlan {
  const { current, hasTables, known, expected, state, appVersion } = input;
  const fresh = input.fresh ?? { kind: "none" };
  if (known.at(-1) !== expected)
    throw new DesktopStartupError(
      "This Cashier installation is damaged: its database update files do not match the app. Reinstall Cashier.",
    );
  if (fresh.kind === "damaged")
    throw new DesktopStartupError(
      "The record of this PC's first database setup is damaged, so Cashier cannot tell which tables are its own. Contact support.",
    );
  if (state?.state === "in-progress")
    throw new DesktopStartupError(
      `The last update failed while changing the database. The data from before the update is saved in ${state.backup}. Choose "Restore backup" to bring it back.`,
      true,
    );
  if (state?.state === "restored" && state.appVersion === appVersion)
    throw new DesktopStartupError(
      `Cashier ${appVersion} could not update the database, so the backup from before the update was restored. Install the corrected version of Cashier.`,
    );
  if (current === expected) return { kind: "ready" };
  // Our own unfinished first installation: the tables are worth nothing, so
  // they are rebuilt rather than treated as somebody else's data. A marker
  // whose checkpoint the database has already reached is not that: the first
  // installation finished and only its cleanup was lost, so the rows are real
  // and no marker may authorise erasing them.
  const abandoned =
    fresh.kind === "owned" &&
    current !== fresh.expected &&
    (fresh.expected === null
      ? current === null
      : current === null || current < fresh.expected);
  if (abandoned) {
    // leftovers are still never rebuilt over a database this app cannot read
    if (current !== null && (!known.includes(current) || current > expected))
      throw new DesktopStartupError(
        "The local database was updated by a newer version of Cashier. Install the latest version.",
      );
    return { kind: "fresh" };
  }
  if (current === null) {
    if (hasTables)
      throw new DesktopStartupError(
        "The local database has tables but no record of its updates, so Cashier cannot update it safely. Contact support.",
      );
    return { kind: "fresh" };
  }
  if (!known.includes(current) || current > expected)
    throw new DesktopStartupError(
      "The local database was updated by a newer version of Cashier. Install the latest version.",
    );
  return { kind: "upgrade", from: current };
}

/** mysqldump writes this footer last, so its absence means an unfinished dump. */
export function isCompleteDump(file: string) {
  try {
    const handle = fs.openSync(file, "r");
    try {
      const size = fs.fstatSync(handle).size;
      const length = Math.min(size, 512);
      const tail = Buffer.alloc(length);
      fs.readSync(handle, tail, 0, length, size - length);
      return (
        tail
          .toString("utf8")
          .trimEnd()
          .split("\n")
          .at(-1)
          ?.startsWith("-- Dump completed") ?? false
      );
    } finally {
      fs.closeSync(handle);
    }
  } catch {
    return false;
  }
}

/** Oldest first: everything beyond the newest five that is not protected. */
export function backupsToDelete(
  backups: Array<{ name: string; modifiedAt: number }>,
  protectedNames: Set<string>,
) {
  return [...backups]
    .sort((a, b) => b.modifiedAt - a.modifiedAt)
    .slice(KEPT_BACKUPS)
    .filter((backup) => !protectedNames.has(backup.name))
    .reverse()
    .map((backup) => backup.name);
}

function writeSafely(file: string, contents: string) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, contents);
  fs.renameSync(temporary, file);
}

export function readUpgradeState(dataDir: string): UpgradeState | null {
  const file = path.join(dataDir, STATE_FILE);
  if (!fs.existsSync(file)) return null;
  try {
    const state = JSON.parse(fs.readFileSync(file, "utf8")) as UpgradeState;
    if (
      ["in-progress", "restored"].includes(state.state) &&
      Number.isSafeInteger(state.from) &&
      Number.isSafeInteger(state.to) &&
      typeof state.appVersion === "string" &&
      typeof state.backup === "string"
    )
      return state;
  } catch {
    // reported below
  }
  throw new DesktopStartupError(
    `The record of the last database update is damaged (${file}). Cashier will not change the database. Contact support.`,
  );
}

export function writeUpgradeState(dataDir: string, state: UpgradeState | null) {
  const file = path.join(dataDir, STATE_FILE);
  if (state === null) fs.rmSync(file, { force: true });
  else writeSafely(file, JSON.stringify(state, null, 2) + "\n");
}

/** Gives a MySQL client program the connection through a file only this Windows user can read. */
async function withClientOptions<T>(
  databaseUrl: string,
  use: (options: string, database: string) => Promise<T>,
) {
  const url = new URL(databaseUrl);
  const options = path.join(
    os.tmpdir(),
    `cashier-${randomBytes(16).toString("hex")}.cnf`,
  );
  fs.writeFileSync(
    options,
    [
      "[client]",
      `user=${decodeURIComponent(url.username)}`,
      `password=${decodeURIComponent(url.password)}`,
      `host=${url.hostname}`,
      `port=${url.port || "3306"}`,
      "protocol=TCP",
      "",
    ].join("\n"),
    { flag: "wx", mode: 0o600 },
  );
  try {
    return await use(options, decodeURIComponent(url.pathname.slice(1)));
  } finally {
    fs.rmSync(options, { force: true });
  }
}

/**
 * Runs a MySQL client program to completion. A program can report a terminal
 * state more than once (a spawn failure emits `error` and then `close`), and the
 * descriptor Windows later reuses for something else must not be closed twice,
 * so the run settles exactly once.
 */
export function runClient(
  program: string,
  args: string[],
  input?: string,
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    let stdin: number | "ignore" = "ignore";
    let settled = false;
    const finish = (code: number | null, error?: Error) => {
      if (settled) return;
      settled = true;
      if (typeof stdin === "number") {
        fs.closeSync(stdin);
        stdin = "ignore";
      }
      resolve({ code, stderr: error ? error.message : stderr });
    };
    let stderr = "";
    try {
      if (input) stdin = fs.openSync(input, "r");
      const child = spawn(program, args, {
        stdio: [stdin, "ignore", "pipe"],
        windowsHide: true,
      });
      child.stderr?.on("data", (data: Buffer) => {
        if (stderr.length < 8_000) stderr += data.toString();
      });
      child.once("error", (error) => finish(null, error));
      child.once("close", (code) => finish(code));
    } catch (error) {
      finish(null, error as Error);
    }
  });
}

async function readCheckpoint(db: Db) {
  const [tables] = await db.$client.query<RowDataPacket[]>(
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()",
  );
  const names = tables.map((row) => String(row.name));
  let current: number | null = null;
  if (names.includes("__drizzle_migrations")) {
    const [rows] = await db.$client.query<RowDataPacket[]>(
      "SELECT MAX(created_at) AS latest FROM __drizzle_migrations",
    );
    current = rows[0]?.latest === null ? null : Number(rows[0].latest);
  }
  return {
    current,
    hasTables: names.some(
      (name) =>
        name !== "__drizzle_migrations" && name !== FRESH_MARKER,
    ),
  };
}

/**
 * Claims an empty database before the first schema change of an install. The
 * claim is idempotent, so an interruption part way through it leaves a claim
 * that the next start can read rather than one it must refuse.
 */
async function writeFreshMarker(
  db: Db,
  databaseName: string,
  expected: number,
  appVersion: string,
) {
  await db.$client.query(
    `CREATE TABLE IF NOT EXISTS ?? (
       id int PRIMARY KEY,
       database_name varchar(64) NOT NULL,
       expected bigint NOT NULL,
       app_version varchar(32) NOT NULL
     )`,
    [FRESH_MARKER],
  );
  await db.$client.query(
    "INSERT INTO ?? (id, database_name, expected, app_version) VALUES (1, ?, ?, ?) ON DUPLICATE KEY UPDATE database_name = VALUES(database_name), expected = VALUES(expected), app_version = VALUES(app_version)",
    [FRESH_MARKER, databaseName, expected, appVersion],
  );
}

async function dropFreshMarker(db: Db) {
  await db.$client.query("DROP TABLE IF EXISTS ??", [FRESH_MARKER]);
}

/**
 * Identifies whose database this is. A marker naming another database, or one
 * that cannot be read, proves nothing and is refused rather than acted on.
 */
async function readFreshMarker(
  db: Db,
  databaseName: string,
): Promise<FreshMarker> {
  const [found] = await db.$client.query<RowDataPacket[]>(
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
    [FRESH_MARKER],
  );
  if (found.length === 0) return { kind: "none" };
  try {
    const [rows] = await db.$client.query<RowDataPacket[]>(
      "SELECT database_name, expected, app_version FROM ??",
      [FRESH_MARKER],
    );
    // a claim interrupted between creating and filling it proved nothing, and
    // nothing can have been built under it yet
    if (rows.length === 0) return { kind: "owned", expected: null };
    if (rows.length !== 1) return { kind: "damaged" };
    const expected = Number(rows[0].expected);
    if (
      String(rows[0].database_name) !== databaseName ||
      !Number.isSafeInteger(expected) ||
      !String(rows[0].app_version)
    )
      return { kind: "damaged" };
    return { kind: "owned", expected };
  } catch {
    return { kind: "damaged" };
  }
}

async function dropAllTables(db: Db) {
  const connection = await db.$client.getConnection();
  try {
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    const [tables] = await connection.query<RowDataPacket[]>(
      "SELECT table_name AS name, table_type AS type FROM information_schema.tables WHERE table_schema = DATABASE()",
    );
    for (const table of tables)
      await connection.query(
        `DROP ${table.type === "VIEW" ? "VIEW" : "TABLE"} ??`,
        [table.name],
      );
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    connection.release();
  }
}

export type DesktopDatabaseOptions = {
  db: Db;
  databaseUrl: string;
  /** Folder holding the bundled mysqldump.exe and mysql.exe. */
  mysqlBin: string;
  /** Shared Cashier folder: upgrade state and `backups/`. */
  dataDir: string;
  migrationsFolder: string;
  expected: number;
  appVersion: string;
  /** Called before slow work starts, so the shell keeps waiting. */
  onBusy?: () => void;
  freeSpace?: (directory: string) => number;
};

const MiB = 1024 * 1024;

async function backUp(
  options: DesktopDatabaseOptions,
  from: number,
  directory: string,
) {
  fs.mkdirSync(directory, { recursive: true });
  for (const name of fs.readdirSync(directory))
    if (name.endsWith(".partial")) fs.rmSync(path.join(directory, name));
  const [rows] = await options.db.$client.query<RowDataPacket[]>(
    "SELECT COALESCE(SUM(data_length + index_length), 0) AS size FROM information_schema.tables WHERE table_schema = DATABASE()",
  );
  const needed = Number(rows[0].size) * 2 + 256 * MiB;
  const free =
    options.freeSpace?.(directory) ??
    (({ bavail, bsize }) => bavail * bsize)(fs.statfsSync(directory));
  if (free < needed)
    throw new DesktopStartupError(
      `There is not enough free disk space to back up the database before updating it. Free at least ${Math.ceil(needed / MiB)} MB on this drive, then reopen Cashier.`,
    );
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  const backup = path.join(
    directory,
    `pre-${from}-to-${options.expected}-${stamp}.sql`,
  );
  const partial = `${backup}.partial`;
  const dumped = await withClientOptions(
    options.databaseUrl,
    (file, database) =>
      runClient(path.join(options.mysqlBin, "mysqldump.exe"), [
        `--defaults-file=${file}`,
        "--single-transaction",
        "--routines",
        "--triggers",
        "--no-tablespaces",
        "--hex-blob",
        "--set-gtid-purged=OFF",
        "--default-character-set=utf8mb4",
        `--result-file=${partial}`,
        database,
      ]),
  );
  if (dumped.code !== 0 || !isCompleteDump(partial)) {
    fs.rmSync(partial, { force: true });
    console.warn(`Database backup failed: ${dumped.stderr.trim()}`);
    throw new DesktopStartupError(
      "Cashier could not back up the database before updating it, so it did not update anything. Details are in backend.log.",
    );
  }
  fs.renameSync(partial, backup);
  return backup;
}

function pruneBackups(directory: string, keep: string) {
  writeSafely(path.join(directory, LAST_KNOWN_GOOD), path.basename(keep));
  const backups = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({
      name,
      modifiedAt: fs.statSync(path.join(directory, name)).mtimeMs,
    }));
  for (const name of backupsToDelete(backups, new Set([path.basename(keep)])))
    fs.rmSync(path.join(directory, name));
}

/**
 * Brings the bundled database to the app's schema before any request is
 * served: nothing to do, create a new database, or back up then migrate.
 */
export async function prepareDesktopDatabase(options: DesktopDatabaseOptions) {
  const { db, dataDir, expected, databaseUrl } = options;
  const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  const { current, hasTables } = await readCheckpoint(db);
  let fresh = await readFreshMarker(db, databaseName);
  let state = readUpgradeState(dataDir);
  // the migration finished but Cashier stopped before clearing the record
  if (state?.state === "in-progress" && current === state.to) {
    writeUpgradeState(dataDir, null);
    state = null;
  }
  // likewise for a first installation whose migrations completed
  if (fresh.kind === "owned" && current === expected) {
    await dropFreshMarker(db);
    fresh = { kind: "none" };
  }
  if (current === expected && state?.state !== "in-progress") {
    if (state) writeUpgradeState(dataDir, null);
    return;
  }
  const journal = JSON.parse(
    fs.readFileSync(
      path.join(options.migrationsFolder, "meta/_journal.json"),
      "utf8",
    ),
  ) as { entries: Array<{ when: number }> };
  const plan = planUpgrade({
    current,
    hasTables,
    known: journal.entries.map((entry) => entry.when),
    expected,
    state,
    appVersion: options.appVersion,
    fresh,
  });
  if (plan.kind === "ready") return;
  options.onBusy?.();
  if (plan.kind === "fresh") {
    if (fresh.kind === "owned") {
      // our own leftovers from an interrupted first installation
      await dropAllTables(db);
      // dropping everything took the claim with it, so it is written again
      // before anything is created: without it a second cut leaves tables
      // that belong to nobody and cannot be rebuilt
      await writeFreshMarker(
        db,
        databaseName,
        expected,
        options.appVersion,
      );
    } else
      await writeFreshMarker(db, databaseName, expected, options.appVersion);
    try {
      await migrate(db, { migrationsFolder: options.migrationsFolder });
    } catch (error) {
      console.warn(`Creating the database failed: ${String(error)}`);
      // nothing of value exists yet, so the next start begins clean
      await dropAllTables(db);
      await dropFreshMarker(db);
      throw new DesktopStartupError(
        "Cashier could not create its database. Details are in backend.log.",
      );
    }
    await dropFreshMarker(db);
    return;
  }
  const backupDirectory = path.join(dataDir, "backups");
  const backup = await backUp(options, plan.from, backupDirectory);
  writeUpgradeState(dataDir, {
    state: "in-progress",
    from: plan.from,
    to: expected,
    appVersion: options.appVersion,
    backup,
  });
  try {
    await migrate(db, { migrationsFolder: options.migrationsFolder });
  } catch (error) {
    console.warn(`Database update failed: ${String(error)}`);
    throw new DesktopStartupError(
      `The database update failed. The data from before the update is saved in ${backup}. Choose "Restore backup" to bring it back.`,
      true,
    );
  }
  writeUpgradeState(dataDir, null);
  pruneBackups(backupDirectory, backup);
}

/** Recreates the database from the backup taken before the failed update. */
export async function restoreDesktopBackup(options: {
  db: Db;
  databaseUrl: string;
  mysqlBin: string;
  dataDir: string;
}) {
  const state = readUpgradeState(options.dataDir);
  if (state?.state !== "in-progress")
    throw new DesktopStartupError("There is no failed update to restore.");
  if (!isCompleteDump(state.backup))
    throw new DesktopStartupError(
      `The backup ${state.backup} is missing or incomplete, so it cannot be restored. Contact support.`,
    );
  await dropAllTables(options.db);
  const restored = await withClientOptions(
    options.databaseUrl,
    (file, database) =>
      runClient(
        path.join(options.mysqlBin, "mysql.exe"),
        [
          `--defaults-file=${file}`,
          "--default-character-set=utf8mb4",
          database,
        ],
        state.backup,
      ),
  );
  const { current } = await readCheckpoint(options.db);
  if (restored.code !== 0 || current !== state.from) {
    console.warn(`Restoring the backup failed: ${restored.stderr.trim()}`);
    throw new DesktopStartupError(
      "Cashier could not restore the backup. Try again; if it fails again, contact support. Details are in backend.log.",
      true,
    );
  }
  writeUpgradeState(options.dataDir, { ...state, state: "restored" });
}
