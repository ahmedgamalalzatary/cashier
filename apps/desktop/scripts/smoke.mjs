import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createRequire } from "node:module";
import { pathToFileURL, URL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const desktop = path.join(root, "apps/desktop");
const require = createRequire(path.join(root, "apps/api/package.json"));
const { parse } = require("dotenv");
const mysql = require("mysql2/promise");
const { drizzle } = require("drizzle-orm/mysql2");
const { migrate } = require("drizzle-orm/mysql2/migrator");
const source = parse(fs.readFileSync(path.join(root, ".env.test")));
const database = new URL(source.DATABASE_URL);
if (
  !/(^test_|_test$)/i.test(database.pathname.slice(1)) ||
  !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname)
)
  throw new Error("Smoke tests require a local *_test database.");
const scratchName = `cashier_desktop_smoke_${process.pid}_${Date.now()}_test`;
const scratchUrl = new URL(database);
scratchUrl.pathname = `/${scratchName}`;
const testPool = mysql.createPool({ uri: scratchUrl.href, timezone: "Z" });
const { uuidv7 } = await import(
  pathToFileURL(path.join(root, "packages/db/dist/uuid.js"))
);
const branchId = uuidv7();
let ownerConnection;
let ownsDatabase = false;
const runtime = path.join(desktop, "src-tauri/runtime");
const manifest = JSON.parse(
  fs.readFileSync(path.join(runtime, "manifest.json"), "utf8"),
);
const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "cashier-runtime-smoke-"),
);
let child;
let exited;
let finished = false;
let stderr = "";
function bounded(promise, label) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(label + " timed out")), 20_000);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
try {
  ownerConnection = await mysql.createConnection(source.DATABASE_URL);
  // CREATE (without IF NOT EXISTS) proves ownership before any later cleanup.
  await ownerConnection.query("CREATE DATABASE ?? CHARACTER SET utf8mb4", [
    scratchName,
  ]);
  ownsDatabase = true;
  await migrate(drizzle(testPool), {
    migrationsFolder: path.join(root, "packages/db/drizzle"),
  });
  await testPool.query("INSERT INTO branches (id, name) VALUES (?, ?)", [
    branchId,
    "Desktop smoke branch",
  ]);
  for (const filename of ["api.mjs", "manifest.json"])
    fs.copyFileSync(
      path.join(runtime, filename),
      path.join(directory, filename),
    );
  const binaryName = `cashier-node-${manifest.target}${process.platform === "win32" ? ".exe" : ""}`;
  const binary = path.join(
    directory,
    process.platform === "win32" ? "node.exe" : "node",
  );
  fs.copyFileSync(path.join(desktop, "src-tauri/binaries", binaryName), binary);
  fs.copyFileSync(
    path.join(desktop, "tests/fixtures/offline.mjs"),
    path.join(directory, "offline.mjs"),
  );
  const settings = path.join(directory, "settings.env");
  fs.writeFileSync(
    settings,
    Object.entries({
      BRANCH_ID: branchId,
      JWT_SECRET: "desktop-smoke-test-secret-over-32-characters",
      ADMIN_USERNAME: "desktop-smoke-admin",
      ADMIN_PASSWORD: "desktop-smoke-password",
      DESKTOP_SYNC_ENABLED: "true",
      EXTERNAL_CATALOG_ENABLED: "false",
      EXTERNAL_ORDERS_BASE_URL: "https://offline.example",
      EXTERNAL_ORDERS_PHONE_NUMBER: "01234567890",
      EXTERNAL_ORDERS_PASSWORD: "offline-password",
    })
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n"),
  );
  child = spawn(
    binary,
    [
      "--import",
      pathToFileURL(path.join(directory, "offline.mjs")).href,
      path.join(directory, "api.mjs"),
      settings,
      path.join(directory, "manifest.json"),
    ],
    {
      cwd: directory,
      env: {
        ...process.env,
        NODE_PATH: "",
        NODE_OPTIONS: "",
        CASHIER_DATABASE_URL: scratchUrl.href,
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  exited = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      finished = true;
      resolve({ code, signal });
    });
  });
  child.stderr.on("data", (data) => {
    stderr += data.toString();
  });
  const ready = new Promise((resolve, reject) => {
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      try {
        const message = JSON.parse(line);
        if (message.event === "ready") resolve(message.apiUrl);
        else if (message.event === "error") reject(new Error(message.message));
      } catch (error) {
        if (line.startsWith("{")) reject(error);
      }
    });
    exited.then(
      ({ code }) =>
        reject(
          new Error(`Backend exited before readiness (${code}): ${stderr}`),
        ),
      reject,
    );
  });
  const base = await bounded(ready, "API startup");
  assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
  for (const origin of [
    "http://localhost:3000",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "tauri://localhost",
  ]) {
    const response = await fetch(base + "/api/auth/login", {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,authorization",
      },
    });
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
  }
  const login = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: {
      Origin: "http://tauri.localhost",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      role: "admin",
      username: "desktop-smoke-admin",
      password: "desktop-smoke-password",
    }),
  });
  assert.equal(login.status, 200);
  const session = await login.json();
  const me = await fetch(base + "/api/auth/me", {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  assert.equal(me.status, 200);
  const user = await me.json();
  assert.equal(user.id, session.user.id);
  assert.equal(user.role, "admin");
  const localBranches = await fetch(base + "/api/branches", {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  assert.equal(localBranches.status, 200);
  assert.deepEqual(
    (await localBranches.json()).map((row) => row.id),
    [branchId],
  );
  const mismatched = await fetch(base + "/api/categories", {
    headers: {
      Authorization: `Bearer ${session.token}`,
      "X-Branch-Id": uuidv7(),
    },
  });
  assert.equal(mismatched.status, 403);
  child.stdin.end();
  const result = await bounded(exited, "Parent-pipe shutdown");
  assert.equal(result.code, 0, stderr);
  await assert.rejects(fetch(base + "/health"));
  console.log(
    "Bundled runtime verified on a fresh owned database outside the repository: offline startup, all CORS origins, role login, branch pinning, and clean shutdown passed.",
  );
} finally {
  if (child && !finished) {
    child.kill();
    await bounded(exited, "Child cleanup");
  }
  try {
    await testPool.end();
    if (ownsDatabase) {
      assert.match(scratchName, /^cashier_desktop_smoke_\d+_\d+_test$/);
      await ownerConnection.query("DROP DATABASE ??", [scratchName]);
    }
  } finally {
    await ownerConnection?.end();
  }
  assert.ok(
    directory.startsWith(path.join(os.tmpdir(), "cashier-runtime-smoke-")),
  );
  fs.rmSync(directory, { recursive: true, force: true });
}
