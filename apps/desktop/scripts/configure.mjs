import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "../../..");
const require = createRequire(path.join(root, "apps/api/package.json"));
const { parse } = require("dotenv");
const { z } = require("zod");
const option = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  if (!process.argv[index + 1]) throw new Error(`${name} needs a path`);
  return path.resolve(process.argv[index + 1]);
};
if (process.platform !== "win32")
  throw new Error("Desktop settings are configured on Windows only.");
// The shared folder the app uses for every Windows user (plan D19).
function sharedFolder() {
  if (!process.env.ProgramData)
    throw new Error("Windows did not report the ProgramData folder.");
  const folder = path.join(process.env.ProgramData, "Cashier");
  if (fs.existsSync(folder)) return folder;
  // Same steps as the app: create under a temporary name, let every Windows
  // user change it (S-1-5-32-545 = Users), then rename.
  const staging = `${folder}.setup-${process.pid}`;
  fs.mkdirSync(staging, { recursive: true });
  const granted = spawnSync(
    "icacls",
    [staging, "/grant", "*S-1-5-32-545:(OI)(CI)M", "/Q"],
    { stdio: "ignore" },
  );
  if (granted.status !== 0) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw new Error(`Cannot share ${folder} with the other Windows users.`);
  }
  fs.renameSync(staging, folder);
  return folder;
}
const directory = option("--directory") ?? sharedFolder();
const filename = path.join(directory, "settings.env");
// An existing file (the app creates one on its first start) keeps every line;
// only settings it lacks are added.
const existingText = fs.existsSync(filename)
  ? fs.readFileSync(filename, "utf8")
  : null;
const existing = existingText === null ? {} : parse(existingText);
const source = parse(
  fs.readFileSync(option("--source") ?? path.join(root, ".env")),
);
const pick = (key) => existing[key] ?? source[key];
// Without a branch the PC shows its link screen on the next start (Phase 9);
// a developer may preset one to require a matching link code.
const branch = pick("BRANCH_ID");
if (branch && !z.string().uuid().safeParse(branch).success)
  throw new Error(
    "BRANCH_ID must be the UUID of this PC's branch, or left out so the PC links itself.",
  );
const keys = [
  "BRANCH_ID",
  "ONLINE_API_URL",
  "JWT_SECRET",
  "EXTERNAL_ORDERS_BASE_URL",
  "EXTERNAL_ORDERS_PHONE_NUMBER",
  "EXTERNAL_ORDERS_PASSWORD",
  "EXTERNAL_CATALOG_ENABLED",
  "DESKTOP_SYNC_ENABLED",
];
const values = Object.fromEntries(
  keys
    .filter((key) => existing[key] === undefined && source[key] !== undefined)
    .map((key) => [key, source[key]]),
);
if (!pick("JWT_SECRET")) values.JWT_SECRET = randomBytes(32).toString("hex");
if (pick("DESKTOP_SYNC_ENABLED") === undefined)
  values.DESKTOP_SYNC_ENABLED = "true";
const lines = Object.entries(values).map(
  ([key, value]) => `${key}=${JSON.stringify(value)}`,
);
if (lines.length === 0) {
  console.log(`Existing desktop settings preserved: ${filename}`);
} else {
  fs.mkdirSync(directory, { recursive: true });
  const separator = existingText && !existingText.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(filename, separator + lines.join("\n") + "\n", {
    mode: 0o600,
  });
  console.log(
    `${existingText === null ? "Imported" : "Added missing"} local desktop settings: ${filename}`,
  );
}
