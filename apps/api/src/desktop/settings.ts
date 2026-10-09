import fs from "node:fs";
import { parse } from "dotenv";
import { parseRuntimeEnv } from "../env.js";
import { z } from "zod";
import { onlineApiUrl } from "./link.js";

export const desktopOrigins = [
  "http://localhost:3000",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
];

/**
 * Reads the shared PC settings. The database address comes from the desktop
 * shell, which owns the bundled MySQL; a DATABASE_URL left in the file by an
 * older version is ignored.
 */
export function loadDesktopSettings(filename: string, databaseUrl: string) {
  if (!fs.existsSync(filename))
    throw new Error(`Desktop settings are missing: ${filename}`);
  if (!databaseUrl)
    throw new Error("The bundled database address was not provided");
  const source = parse(fs.readFileSync(filename));
  if (source.DATABASE_URL !== undefined)
    console.warn(
      "Ignoring DATABASE_URL in settings.env: Cashier now uses its bundled database.",
    );
  if (!source.BRANCH_ID)
    throw new Error(
      "This PC is not linked yet. Ask the system administrator to link it to its branch.",
    );
  const selectedBranch = z.string().uuid().safeParse(source.BRANCH_ID);
  if (!selectedBranch.success)
    throw new Error("BRANCH_ID must be the UUID of this PC's branch");
  const deviceToken = source.DEVICE_TOKEN?.trim();
  if (!deviceToken || deviceToken.length < 32)
    throw new Error(
      "DEVICE_TOKEN is missing or invalid; link this PC to its branch.",
    );
  const syncSwitch = source.DESKTOP_SYNC_ENABLED ?? "true";
  if (!["true", "false"].includes(syncSwitch))
    throw new Error("DESKTOP_SYNC_ENABLED must be true or false");
  const syncEnabled = syncSwitch === "true";
  const environment = parseRuntimeEnv({
    ...source,
    DATABASE_URL: databaseUrl,
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
  return {
    environment,
    deviceToken,
    onlineApiUrl: onlineApiUrl(source),
    syncEnabled,
    branchId: selectedBranch.data,
  };
}
