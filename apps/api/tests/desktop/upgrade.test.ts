import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Db } from "@cashier/db";
import {
  DesktopStartupError,
  backupsToDelete,
  isCompleteDump,
  planUpgrade,
  readUpgradeState,
  restoreDesktopBackup,
  runClient,
  writeUpgradeState,
  type UpgradeState,
} from "../../src/desktop/upgrade.js";

const known = [100, 200, 300];
const plan = (overrides: Partial<Parameters<typeof planUpgrade>[0]> = {}) =>
  planUpgrade({
    current: 300,
    hasTables: true,
    known,
    expected: 300,
    state: null,
    appVersion: "1.2.0",
    ...overrides,
  });
const failed: UpgradeState = {
  state: "in-progress",
  from: 200,
  to: 300,
  appVersion: "1.2.0",
  backup: "C:/ProgramData/Cashier/backups/pre-200-to-300.sql",
};

const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    if (!directory.startsWith(path.join(os.tmpdir(), "cashier-upgrade-")))
      throw new Error("Unexpected test directory");
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
function scratch() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cashier-upgrade-"));
  directories.push(directory);
  return directory;
}

describe("desktop database upgrade decision", () => {
  it("starts directly when the database matches the app", () => {
    expect(plan()).toEqual({ kind: "ready" });
  });
  it("creates the schema of a brand-new empty database without a backup", () => {
    expect(plan({ current: null, hasTables: false })).toEqual({
      kind: "fresh",
    });
  });
  it("backs up and migrates when known migrations are pending", () => {
    expect(plan({ current: 200 })).toEqual({ kind: "upgrade", from: 200 });
    expect(plan({ current: 100 })).toEqual({ kind: "upgrade", from: 100 });
  });
  it.each([400, 250])(
    "refuses a database written by a newer or unknown version (%s)",
    (current) => {
      expect(() => plan({ current })).toThrow("newer version");
    },
  );
  it("refuses tables without a migration record instead of guessing", () => {
    expect(() => plan({ current: null, hasTables: true })).toThrow(
      DesktopStartupError,
    );
  });
  it("blocks after a failed update and offers the restore", () => {
    try {
      plan({ current: 200, state: failed });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DesktopStartupError);
      expect((error as DesktopStartupError).message).toContain(
        "last update failed",
      );
      expect((error as DesktopStartupError).canRestore).toBe(true);
    }
  });
  it("keeps the failed version blocked after its backup was restored", () => {
    const restored = { ...failed, state: "restored" as const };
    expect(() => plan({ current: 200, state: restored })).toThrow(
      "corrected version",
    );
    // a corrected release upgrades normally from the restored database
    expect(
      plan({ current: 200, state: restored, appVersion: "1.2.1" }),
    ).toEqual({ kind: "upgrade", from: 200 });
  });
  it("refuses an installation whose manifest and migrations disagree", () => {
    expect(() => plan({ expected: 350 })).toThrow("installation");
  });
  it("refuses tables it cannot recognise as its own first installation", () => {
    // tables with no migration record and no marker stay somebody else's
    expect(() => plan({ current: null, hasTables: true })).toThrow(
      "no record of its updates",
    );
  });
  it("rebuilds the database when its own marker says the install was cut short", () => {
    expect(
      plan({
        current: null,
        hasTables: true,
        fresh: { kind: "owned", expected: 300 },
      }),
    ).toEqual({ kind: "fresh" });
  });
  it("refuses a newer database even when the marker outlived its bootstrap", () => {
    // The database reached the checkpoint its own marker was written for, so
    // the first installation finished and only the cleanup was lost. The rows
    // are real; an older app must refuse them, not wipe them.
    expect(() =>
      plan({
        current: 300,
        known: [100, 200],
        expected: 200,
        fresh: { kind: "owned", expected: 300 },
      }),
    ).toThrow("newer version");
  });
  it("refuses to rebuild our own leftovers over a newer database", () => {
    expect(() =>
      plan({
        current: 250,
        known: [100, 200],
        expected: 200,
        fresh: { kind: "owned", expected: 300 },
      }),
    ).toThrow("newer version");
  });
  it("rebuilds when the marker's own checkpoint was never reached", () => {
    expect(
      plan({
        current: 100,
        fresh: { kind: "owned", expected: 300 },
      }),
    ).toEqual({ kind: "fresh" });
  });
  it("recovers a claim interrupted before it was recorded", () => {
    // the marker table exists but the ownership row never landed
    expect(
      plan({
        current: null,
        hasTables: false,
        fresh: { kind: "owned", expected: null },
      }),
    ).toEqual({ kind: "fresh" });
  });
  it("upgrades rather than rebuilds when an unrecorded marker meets a recorded database", () => {
    // nothing was proved about ownership, so the tables are treated as a
    // normal installation instead of being destroyed
    expect(plan({ current: 100, fresh: { kind: "owned", expected: null } })).toEqual({
      kind: "upgrade",
      from: 100,
    });
  });
  it("refuses a damaged marker instead of dropping what it cannot vouch for", () => {
    expect(() =>
      plan({ current: null, hasTables: true, fresh: { kind: "damaged" } }),
    ).toThrow("damaged");
  });
});

describe("desktop backups", () => {
  it("accepts only a dump that mysqldump finished", () => {
    const directory = scratch();
    const complete = path.join(directory, "complete.sql");
    fs.writeFileSync(
      complete,
      "-- MySQL dump\nINSERT INTO t VALUES (1);\n-- Dump completed on 2026-10-08 10:00:00\n",
    );
    const truncated = path.join(directory, "truncated.sql");
    fs.writeFileSync(truncated, "-- MySQL dump\nINSERT INTO t VALUES (1");
    expect(isCompleteDump(complete)).toBe(true);
    expect(isCompleteDump(truncated)).toBe(false);
    expect(isCompleteDump(path.join(directory, "missing.sql"))).toBe(false);
  });
  it("keeps the newest five plus every protected backup", () => {
    const backups = Array.from({ length: 8 }, (_, index) => ({
      name: `pre-${index}.sql`,
      modifiedAt: index,
    }));
    expect(backupsToDelete(backups, new Set(["pre-0.sql"]))).toEqual([
      "pre-1.sql",
      "pre-2.sql",
    ]);
    expect(backupsToDelete(backups.slice(0, 5), new Set())).toEqual([]);
  });
  it("stores the upgrade state safely and reads it back", () => {
    const directory = scratch();
    expect(readUpgradeState(directory)).toBeNull();
    writeUpgradeState(directory, failed);
    expect(readUpgradeState(directory)).toEqual(failed);
    expect(fs.readdirSync(directory)).toEqual(["upgrade-in-progress.json"]);
    writeUpgradeState(directory, null);
    expect(readUpgradeState(directory)).toBeNull();
  });
  it("treats an unreadable state file as a failed update, never as none", () => {
    const directory = scratch();
    fs.writeFileSync(path.join(directory, "upgrade-in-progress.json"), "{");
    expect(() => readUpgradeState(directory)).toThrow(DesktopStartupError);
  });
});

/**
 * Counts the descriptors this code closes, so a second close of a descriptor
 * Windows has already handed to someone else shows up as a number instead of
 * only as an uncaught EBADF.
 */
function countClosedDescriptors() {
  const close = vi.spyOn(fs, "closeSync");
  return () => close.mock.calls.filter(([fd]) => typeof fd === "number").length;
}

const node = process.execPath;
const script = (source: string) => [node, ["-e", source]] as const;

describe("running a MySQL client program", () => {
  const withBackup = () => {
    const directory = scratch();
    const input = path.join(directory, "backup.sql");
    fs.writeFileSync(input, "SELECT 1;\n");
    return { directory, input };
  };

  it("closes the backup descriptor once when the program cannot start", async () => {
    const { directory, input } = withBackup();
    const closed = countClosedDescriptors();

    const result = await runClient(
      path.join(directory, "missing-mysql.exe"),
      [],
      input,
    );

    expect(closed()).toBe(1);
    expect(result.code).toBeNull();
    expect(result.stderr).toMatch(/ENOENT/);
  });

  it("closes the backup descriptor once after a program that ran and failed", async () => {
    const { input } = withBackup();
    const closed = countClosedDescriptors();
    const [program, args] = script(
      "process.stderr.write('bad dump'); process.exit(3)",
    );

    const result = await runClient(program, args, input);

    expect(closed()).toBe(1);
    expect(result).toEqual({ code: 3, stderr: "bad dump" });
  });

  it("closes the backup descriptor once after a program that succeeded", async () => {
    const { input } = withBackup();
    const closed = countClosedDescriptors();
    const [program, args] = script("process.stdout.write('ignored')");

    const result = await runClient(program, args, input);

    expect(closed()).toBe(1);
    expect(result).toEqual({ code: 0, stderr: "" });
  });

  it("reports a program that cannot be opened instead of throwing out of the run", async () => {
    const { input } = withBackup();
    const closed = countClosedDescriptors();
    vi.spyOn(fs, "openSync").mockImplementation(() => {
      throw new Error("EMFILE: too many open files");
    });

    const result = await runClient(node, ["-e", ""], input);

    expect(closed()).toBe(0);
    expect(result).toEqual({ code: null, stderr: "EMFILE: too many open files" });
  });
});

describe("restoring the backup taken before a failed update", () => {
  const dump = "-- MySQL dump\n-- Dump completed on 2026-10-08 10:00:00\n";

  /** A database still at the checkpoint the backup was taken from. */
  const databaseAt = (from: number) =>
    ({
      $client: {
        query: vi.fn(async (sql: string) =>
          sql.includes("information_schema")
            ? [[{ name: "__drizzle_migrations" }], []]
            : [[{ latest: from }], []],
        ),
        getConnection: vi.fn(async () => ({
          query: vi.fn(async () => [[], []]),
          release: vi.fn(),
        })),
      },
    }) as unknown as Db;

  const failedUpdate = (backup: string, dataDir: string) =>
    writeUpgradeState(dataDir, { ...failed, backup });

  /** A bin folder holding a `mysql.exe` that fails the way a missing one does. */
  const unusableClient = (directory: string) => {
    const bin = path.join(directory, "bin");
    fs.mkdirSync(bin);
    fs.copyFileSync(node, path.join(bin, "mysql.exe"));
    return bin;
  };

  it("gives one recoverable error and keeps the backup when the program cannot start", async () => {
    const directory = scratch();
    const backup = path.join(directory, "pre-200-to-300.sql");
    fs.writeFileSync(backup, dump);
    failedUpdate(backup, directory);

    await expect(
      restoreDesktopBackup({
        db: databaseAt(200),
        databaseUrl: "mysql://cashier:secret@127.0.0.1:3307/cashier_scratch",
        mysqlBin: path.join(directory, "no-mysql-here"),
        dataDir: directory,
      }),
    ).rejects.toThrow(DesktopStartupError);
    // an escaping second close would surface here as an unhandled EBADF
    expect(fs.readFileSync(backup, "utf8")).toBe(dump);
    expect(readUpgradeState(directory)?.state).toBe("in-progress");
  });

  it("keeps the recovery marker and backup when the program exits unsuccessfully", async () => {
    const directory = scratch();
    const backup = path.join(directory, "pre-200-to-300.sql");
    fs.writeFileSync(backup, dump);
    failedUpdate(backup, directory);

    const failure = await restoreDesktopBackup({
      db: databaseAt(200),
      databaseUrl: "mysql://cashier:secret@127.0.0.1:3307/cashier_scratch",
      mysqlBin: unusableClient(directory),
      dataDir: directory,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(DesktopStartupError);
    expect((failure as DesktopStartupError).canRestore).toBe(true);
    expect(fs.readFileSync(backup, "utf8")).toBe(dump);
    expect(readUpgradeState(directory)?.state).toBe("in-progress");
  });

  it("refuses to restore a backup that mysqldump did not finish", async () => {
    const directory = scratch();
    const backup = path.join(directory, "pre-200-to-300.sql");
    fs.writeFileSync(backup, "-- MySQL dump\nINSERT INTO t VALUES (1");
    failedUpdate(backup, directory);

    await expect(
      restoreDesktopBackup({
        db: databaseAt(200),
        databaseUrl: "mysql://cashier:secret@127.0.0.1:3307/cashier_scratch",
        mysqlBin: unusableClient(directory),
        dataDir: directory,
      }),
    ).rejects.toThrow(/missing or incomplete/);
  });

  /** The backup progress the PC keeps beside its settings, outside the dump. */
  const backupRecord = (directory: string) =>
    path.join(directory, "backup-generation.json");
  const readyRecord = {
    deviceHash: "hash",
    generation: 3,
    acknowledgedSeq: 40,
    phase: "ready",
  };

  it("marks the online backup for a fresh start before the restore replaces the data", async () => {
    const directory = scratch();
    const backup = path.join(directory, "pre-200-to-300.sql");
    fs.writeFileSync(backup, dump);
    failedUpdate(backup, directory);
    fs.writeFileSync(backupRecord(directory), JSON.stringify(readyRecord));

    await restoreDesktopBackup({
      db: databaseAt(200),
      databaseUrl: "mysql://cashier:secret@127.0.0.1:3307/cashier_scratch",
      mysqlBin: unusableClient(directory),
      dataDir: directory,
    }).catch(() => undefined);

    expect(JSON.parse(fs.readFileSync(backupRecord(directory), "utf8"))).toEqual(
      { ...readyRecord, requiresReset: true },
    );
  });

  it("leaves the online backup alone when the restore is refused", async () => {
    const directory = scratch();
    const backup = path.join(directory, "pre-200-to-300.sql");
    fs.writeFileSync(backup, "-- MySQL dump\nINSERT INTO t VALUES (1");
    failedUpdate(backup, directory);
    fs.writeFileSync(backupRecord(directory), JSON.stringify(readyRecord));

    await restoreDesktopBackup({
      db: databaseAt(200),
      databaseUrl: "mysql://cashier:secret@127.0.0.1:3307/cashier_scratch",
      mysqlBin: unusableClient(directory),
      dataDir: directory,
    }).catch(() => undefined);

    expect(JSON.parse(fs.readFileSync(backupRecord(directory), "utf8"))).toEqual(
      readyRecord,
    );
  });
});
