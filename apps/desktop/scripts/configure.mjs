import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { URL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const require = createRequire(path.join(root, "apps/api/package.json"));
const { parse } = require("dotenv");
const option = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  if (!process.argv[index + 1]) throw new Error(`${name} needs a path`);
  return path.resolve(process.argv[index + 1]);
};
const dataHome =
  process.platform === "win32"
    ? process.env.APPDATA
    : process.platform === "darwin"
      ? path.join(os.homedir(), "Library/Application Support")
      : process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local/share");
if (!dataHome) throw new Error("Cannot find the application user-data folder.");
const identifier = JSON.parse(
  fs.readFileSync(
    path.join(root, "apps/desktop/src-tauri/tauri.conf.json"),
    "utf8",
  ),
).identifier;
const directory = option("--directory") ?? path.join(dataHome, identifier);
const filename = path.join(directory, "settings.env");
if (fs.existsSync(filename)) {
  console.log(`Existing desktop settings preserved: ${filename}`);
} else {
  const source = parse(
    fs.readFileSync(option("--source") ?? path.join(root, ".env")),
  );
  if (!source.DATABASE_URL || !source.ADMIN_USERNAME || !source.ADMIN_PASSWORD)
    throw new Error(
      "Configure DATABASE_URL and admin credentials before importing desktop settings.",
    );
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(source.DATABASE_URL).hostname,
    )
  )
    throw new Error("Desktop settings require local MySQL.");
  const keys = [
    "DATABASE_URL",
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
