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
if (fs.existsSync(filename)) {
  console.log(`Existing desktop settings preserved: ${filename}`);
} else {
  const source = parse(
    fs.readFileSync(option("--source") ?? path.join(root, ".env")),
  );
  if (!source.ADMIN_USERNAME || !source.ADMIN_PASSWORD)
    throw new Error(
      "Configure admin credentials before importing desktop settings.",
    );
  if (!z.string().uuid().safeParse(source.BRANCH_ID).success)
    throw new Error(
      "Configure BRANCH_ID with the UUID of this PC's branch before importing settings.",
    );
  const keys = [
    "BRANCH_ID",
    "JWT_SECRET",
    "ADMIN_NAME",
    "ADMIN_USERNAME",
    "ADMIN_PASSWORD",
    "EXTERNAL_ORDERS_BASE_URL",
    "EXTERNAL_ORDERS_PHONE_NUMBER",
    "EXTERNAL_ORDERS_PASSWORD",
    "EXTERNAL_CATALOG_ENABLED",
  ];
  const values = Object.fromEntries(
    keys
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
  values.JWT_SECRET ||= randomBytes(32).toString("hex");
  values.DESKTOP_SYNC_ENABLED = source.DESKTOP_SYNC_ENABLED ?? "true";
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    filename,
    Object.entries(values)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n") + "\n",
    { flag: "wx", mode: 0o600 },
  );
  console.log(`Imported local desktop settings: ${filename}`);
}
