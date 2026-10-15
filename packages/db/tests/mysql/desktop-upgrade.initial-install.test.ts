import fs from "node:fs";
import path from "node:path";
import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { type Db } from "../../src/client.js";
import { prepareDesktopDatabase } from "../../../../apps/api/src/desktop/upgrade.js";
import {
  baseline,
  blockingMigrations,
  branchNames,
  kill,
  migrations,
  mysqlBin,
  next,
  scratchDatabase,
  scratchFolder,
  startPreparation,
  tables,
  waitForTable,
  working,
} from "../support/desktop-upgrade-fixtures.js";

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

    it("keeps a newer database when the marker outlived the app that wrote it", async () => {
      const { url, db, dataDir } = await fresh();
      // a newer Cashier completes its installation and writes real rows
      await prepareDesktopDatabase({
        db,
        databaseUrl: url,
        mysqlBin,
        dataDir,
        migrationsFolder: migrations(working),
        expected: next,
        appVersion: "2.0.0",
      });
      await db.$client.query(
        "INSERT INTO branches (id, name) VALUES ('019a1234-5678-7000-8000-0000000000ee', 'فرع من إصدار أحدث')",
      );
      // and its marker only outlived the cleanup that should have removed it
      await db.$client.query(
        "CREATE TABLE __cashier_fresh_bootstrap (id int PRIMARY KEY, database_name varchar(64) NOT NULL, expected bigint NOT NULL, app_version varchar(32) NOT NULL)",
      );
      await db.$client.query(
        `INSERT INTO __cashier_fresh_bootstrap VALUES (1, '${new URL(url).pathname.slice(1)}', ${next}, '2.0.0')`,
      );

      // an older Cashier opens the same database and must not erase it
      await expect(prepare(url, db, dataDir, migrations())).rejects.toThrow(
        "newer version",
      );
      expect(await branchNames(db)).toEqual(["فرع من إصدار أحدث"]);
      expect(await tables(db)).toContain("upgrade_probe");
    });

    it("upgrades a database whose marker outlived a finished bootstrap", async () => {
      const { url, db, dataDir } = await fresh();
      await prepare(url, db, dataDir, migrations());
      await db.$client.query(
        "INSERT INTO branches (id, name) VALUES ('019a1234-5678-7000-8000-0000000000ff', 'فرع قبل التحديث')",
      );
      await db.$client.query(
        "CREATE TABLE __cashier_fresh_bootstrap (id int PRIMARY KEY, database_name varchar(64) NOT NULL, expected bigint NOT NULL, app_version varchar(32) NOT NULL)",
      );
      await db.$client.query(
        `INSERT INTO __cashier_fresh_bootstrap VALUES (1, '${new URL(url).pathname.slice(1)}', ${baseline}, '1.0.0')`,
      );

      await prepareDesktopDatabase({
        db,
        databaseUrl: url,
        mysqlBin,
        dataDir,
        migrationsFolder: migrations(working),
        expected: next,
        appVersion: "2.0.0",
      });

      expect(await branchNames(db)).toEqual(["فرع قبل التحديث"]);
      expect(await tables(db)).toContain("upgrade_probe");
    });

    it("recovers when the claim was cut short before it was recorded", async () => {
      const { url, db, dataDir } = await fresh();
      // the marker table was created but the ownership row never landed
      await db.$client.query(
        "CREATE TABLE __cashier_fresh_bootstrap (id int PRIMARY KEY, database_name varchar(64) NOT NULL, expected bigint NOT NULL, app_version varchar(32) NOT NULL)",
      );

      await prepare(url, db, dataDir, migrations());

      expect(await tables(db)).toEqual(["__drizzle_migrations", "branches"]);
    });

    it("survives being cut short again while recovering", async () => {
      const { url, db, dataDir } = await fresh();
      await interruptFirstInstallation(url, db, dataDir);
      // the recovery itself is cut short, after it dropped the abandoned
      // tables and created a replacement table of its own
      const second = startPreparation(
        url,
        dataDir,
        blockingMigrations("recovery_probe"),
        baseline,
      );
      await waitForTable(db, "recovery_probe", second);
      await kill(second);
      expect(await tables(db)).toContain("recovery_probe");

      await prepare(url, db, dataDir, migrations());

      expect(await tables(db)).toEqual(["__drizzle_migrations", "branches"]);
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
      await db.$client.query("CREATE TABLE real_business (id int PRIMARY KEY)");

      await expect(prepare(url, db, dataDir, migrations())).rejects.toThrow(
        /support/i,
      );

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

      await expect(prepare(url, db, dataDir, brokenFolder)).rejects.toThrow(
        "could not create its database",
      );
      expect(await tables(db)).toEqual([]);

      await prepare(url, db, dataDir, migrations());

      expect(await tables(db)).toEqual(["__drizzle_migrations", "branches"]);
    });
  },
);
