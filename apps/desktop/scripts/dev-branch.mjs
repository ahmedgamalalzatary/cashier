// Developer/test setup only (plan 5.4): creates the configured BRANCH_ID in
// the bundled database so a development PC can log in before Phase 9 linking.
// Never shipped in the installer; no production default branch exists.
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const repository = path.resolve(import.meta.dirname, "../../..");
const require = createRequire(path.join(repository, "apps/api/package.json"));
const { parse } = require("dotenv");
const mysql2 = require("mysql2/promise");
const { drizzle } = require("drizzle-orm/mysql2");
const { migrate } = require("drizzle-orm/mysql2/migrator");

const plain = (file) => file.replaceAll("\\", "/");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function accepts(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

/** The app keeps `cashier.lock` open without sharing while it runs. */
function cashierRunning(root) {
  const lock = path.join(root, "cashier.lock");
  if (!fs.existsSync(lock)) return false;
  try {
    fs.renameSync(lock, `${lock}.check`);
    fs.renameSync(`${lock}.check`, lock);
    return false;
  } catch {
    return true;
  }
}

/** Gives a MySQL client program its password through a temporary file. */
function clientOptions(user, password, port) {
  const file = path.join(
    os.tmpdir(),
    `cashier-${randomBytes(16).toString("hex")}.cnf`,
  );
  fs.writeFileSync(
    file,
    `[client]\nuser=${user}\npassword=${password}\nhost=127.0.0.1\nport=${port}\nprotocol=TCP\n`,
    { flag: "wx", mode: 0o600 },
  );
  return file;
}

/**
 * Starts the bundled MySQL on the shared data, applies the schema if needed and
 * inserts the configured branch when the database has none.
 * Returns "created" or "already present".
 */
export async function createDevBranch({ root, mysql, migrationsFolder, name }) {
  const settingsFile = path.join(root, "settings.env");
  const settings = fs.existsSync(settingsFile)
    ? parse(fs.readFileSync(settingsFile))
    : {};
  if (!fs.existsSync(path.join(root, "mysql")))
    throw new Error(
      "Open Cashier once first, so it creates its database, then run this again.",
    );
  if (cashierRunning(root))
    throw new Error("Close Cashier first, then run this again.");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      settings.BRANCH_ID ?? "",
    )
  )
    throw new Error(
      `Set BRANCH_ID in ${settingsFile} (run pnpm configure:desktop).`,
    );
  if (!settings.MYSQL_PASSWORD || !settings.MYSQL_ROOT_PASSWORD)
    throw new Error(`The database passwords are missing from ${settingsFile}.`);

  const port = await freePort();
  const server = spawn(
    path.join(mysql, "bin/mysqld.exe"),
    [
      `--defaults-file=${plain(path.join(root, "my.ini"))}`,
      `--basedir=${plain(mysql)}`,
      `--port=${port}`,
    ],
    { stdio: "ignore", windowsHide: true },
  );
  const exited = new Promise((resolve) => server.once("exit", resolve));
  let stopped = false;
  exited.then(() => (stopped = true));
  try {
    const deadline = Date.now() + 120_000;
    while (!(await accepts(port))) {
      if (stopped || Date.now() > deadline)
        throw new Error(
          `The bundled MySQL did not start; see ${path.join(root, "mysqld.log")}.`,
        );
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const pool = mysql2.createPool({
      host: "127.0.0.1",
      port,
      user: "cashier",
      password: settings.MYSQL_PASSWORD,
      database: "cashier",
      timezone: "Z",
    });
    try {
      await migrate(drizzle(pool), { migrationsFolder });
      const [rows] = await pool.query("SELECT id FROM branches");
      if (rows.length === 1 && rows[0].id === settings.BRANCH_ID)
        return "already present";
      if (rows.length > 0)
        throw new Error(
          "The bundled database already holds another branch; it was left unchanged.",
        );
      await pool.query("INSERT INTO branches (id, name) VALUES (?, ?)", [
        settings.BRANCH_ID,
        name,
      ]);
      return "created";
    } finally {
      await pool.end();
    }
  } finally {
    if (!stopped) {
      const options = clientOptions("root", settings.MYSQL_ROOT_PASSWORD, port);
      try {
        await new Promise((resolve) =>
          spawn(
            path.join(mysql, "bin/mysqladmin.exe"),
            [`--defaults-file=${plain(options)}`, "shutdown"],
            { stdio: "ignore", windowsHide: true },
          ).once("exit", resolve),
        );
      } finally {
        fs.rmSync(options, { force: true });
      }
      const timer = setTimeout(() => server.kill(), 30_000);
      await exited;
      clearTimeout(timer);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const nameIndex = process.argv.indexOf("--name");
  const result = await createDevBranch({
    root: path.join(process.env.ProgramData ?? "C:\\ProgramData", "Cashier"),
    mysql: path.join(import.meta.dirname, "../src-tauri/runtime/mysql"),
    migrationsFolder: path.join(repository, "packages/db/drizzle"),
    name: nameIndex > 0 ? process.argv[nameIndex + 1] : "Development branch",
  });
  console.log(`Development branch ${result}.`);
}
