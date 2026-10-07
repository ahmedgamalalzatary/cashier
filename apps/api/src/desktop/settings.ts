import fs from "node:fs";
import { parse } from "dotenv";
import { parseRuntimeEnv } from "../env.js";
import { getAdminSeedConfig } from "../db/seed-config.js";

export const desktopOrigins = [
  "http://localhost:3000",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
];

export function loadDesktopSettings(filename: string) {
  if (!fs.existsSync(filename))
    throw new Error(`Desktop settings are missing: ${filename}`);
  const source = parse(fs.readFileSync(filename));
  const syncSwitch = source.DESKTOP_SYNC_ENABLED ?? "true";
  if (!["true", "false"].includes(syncSwitch))
    throw new Error("DESKTOP_SYNC_ENABLED must be true or false");
  const syncEnabled = syncSwitch === "true";
  const environment = parseRuntimeEnv({
    ...source,
    ...(!syncEnabled && {
      EXTERNAL_ORDERS_BASE_URL: "https://offline.invalid",
      EXTERNAL_ORDERS_PHONE_NUMBER: "00000000000",
      EXTERNAL_ORDERS_PASSWORD: "disabled",
    }),
    CORS_ORIGIN: [
      ...new Set([
        ...desktopOrigins,
        ...(source.CORS_ORIGIN?.split(",")
          .map((origin) => origin.trim())
          .filter(Boolean) ?? []),
      ]),
    ].join(","),
    TRUST_PROXY: "false",
  });
  const host = new URL(environment.DATABASE_URL).hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host))
    throw new Error("Desktop DATABASE_URL must point to a local MySQL server");
  return { environment, admin: getAdminSeedConfig(source), syncEnabled };
}
