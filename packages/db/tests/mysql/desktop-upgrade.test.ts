import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DesktopStartupError,
  prepareDesktopDatabase,
  readUpgradeState,
  restoreDesktopBackup,
} from "../../../../apps/api/src/desktop/upgrade.js";
import {
  backups,
  baseline,
  branchNames,
  broken,
  migrations,
  mysqlBin,
  next,
  olderDatabase,
  scratchDatabase,
  scratchFolder,
  tables,
  working,
} from "../support/desktop-upgrade-fixtures.js";

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
