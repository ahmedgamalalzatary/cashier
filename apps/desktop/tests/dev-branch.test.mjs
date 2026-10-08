import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createDevBranch } from "../scripts/dev-branch.mjs";

const mysql = path.resolve(import.meta.dirname, "../src-tauri/runtime/mysql");
const migrationsFolder = path.resolve(
  import.meta.dirname,
  "../../../packages/db/drizzle",
);
const ready = fs.existsSync(path.join(mysql, "bin/mysqld.exe"));
const branchId = "019a1234-5678-7000-8000-0000000000bb";
const plain = (file) => file.replaceAll("\\", "/");

/** A shared Cashier folder as the app leaves it after its first start. */
function cashierFolder(t, { initialize = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cashier-dev-branch-"));
  t.after(() => {
    assert.ok(root.startsWith(path.join(os.tmpdir(), "cashier-dev-branch-")));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const app = randomBytes(32).toString("hex");
  const rootPassword = randomBytes(32).toString("hex");
  const settings = (id) =>
    fs.writeFileSync(
      path.join(root, "settings.env"),
      `BRANCH_ID="${id}"\nMYSQL_PASSWORD="${app}"\nMYSQL_ROOT_PASSWORD="${rootPassword}"\n`,
    );
  settings(branchId);
  if (!initialize) return { root, settings };
  // the same initialization the desktop shell performs (src/mysql.rs)
  const ini = path.join(root, "my.ini");
  fs.writeFileSync(
    ini,
    `[mysqld]\nbasedir=${plain(mysql)}\ndatadir=${plain(path.join(root, "mysql"))}\nlog-error=${plain(path.join(root, "mysqld.log"))}\nbind-address=127.0.0.1\nskip-name-resolve\nmysqlx=OFF\ndisable-log-bin\n`,
  );
  const setup = path.join(root, "setup.sql");
  fs.writeFileSync(
    setup,
    `RENAME USER 'root'@'localhost' TO 'root'@'127.0.0.1';\nALTER USER 'root'@'127.0.0.1' IDENTIFIED BY '${rootPassword}';\nCREATE DATABASE \`cashier\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;\nCREATE USER 'cashier'@'127.0.0.1' IDENTIFIED BY '${app}';\nGRANT ALL PRIVILEGES ON \`cashier\`.* TO 'cashier'@'127.0.0.1';\n`,
  );
  const result = spawnSync(
    path.join(mysql, "bin/mysqld.exe"),
    [
      `--defaults-file=${plain(ini)}`,
      "--initialize-insecure",
      `--init-file=${plain(setup)}`,
    ],
    { windowsHide: true },
  );
  assert.equal(
    result.status,
    0,
    fs.readFileSync(path.join(root, "mysqld.log"), "utf8"),
  );
  fs.rmSync(setup);
  return { root, settings };
}

test(
  "creates the configured branch in the bundled database once",
  { skip: !ready && "run prepare:desktop first", timeout: 180_000 },
  async (t) => {
    const { root, settings } = cashierFolder(t);
    const options = { root, mysql, migrationsFolder, name: "فرع التطوير" };

    assert.equal(await createDevBranch(options), "created");
    assert.equal(await createDevBranch(options), "already present");

    settings("019a1234-5678-7000-8000-0000000000cc");
    await assert.rejects(createDevBranch(options), /another branch/);
  },
);

test("asks to open Cashier first when it has no database yet", async (t) => {
  const { root } = cashierFolder(t, { initialize: false });
  await assert.rejects(
    createDevBranch({ root, mysql, migrationsFolder, name: "x" }),
    /Open Cashier once/,
  );
});

test("refuses while Cashier is running", async (t) => {
  const { root } = cashierFolder(t, { initialize: false });
  fs.mkdirSync(path.join(root, "mysql"));
  // the app holds this file open without sharing while it runs
  const holder = spawn(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `$f=[IO.File]::Open('${path.join(root, "cashier.lock")}','OpenOrCreate','ReadWrite','None'); Write-Output held; Start-Sleep 30`,
    ],
    { windowsHide: true },
  );
  try {
    await once(holder.stdout, "data");
    await assert.rejects(
      createDevBranch({ root, mysql, migrationsFolder, name: "x" }),
      /Close Cashier/,
    );
  } finally {
    // release the lock before the folder is deleted
    holder.kill();
    await once(holder, "exit");
  }
});

test("refuses a settings file without a branch", async (t) => {
  const { root } = cashierFolder(t, { initialize: false });
  fs.writeFileSync(path.join(root, "settings.env"), 'MYSQL_PASSWORD="x"\n');
  fs.mkdirSync(path.join(root, "mysql"));
  await assert.rejects(
    createDevBranch({ root, mysql, migrationsFolder, name: "x" }),
    /BRANCH_ID/,
  );
});
