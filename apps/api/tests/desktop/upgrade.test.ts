import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DesktopStartupError,
  backupsToDelete,
  isCompleteDump,
  planUpgrade,
  readUpgradeState,
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
