import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadDesktopSettings } from "../../src/desktop/settings.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (!directory.startsWith(path.join(os.tmpdir(), "cashier-settings-")))
      throw new Error("Unexpected test directory");
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function settings(overrides: Record<string, string> = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cashier-settings-"));
  directories.push(directory);
  const filename = path.join(directory, "settings.env");
  const values = {
    BRANCH_ID: "019a1234-5678-7000-8000-000000000001",
    DATABASE_URL: "mysql://cashier:password@localhost:3306/cashier",
    JWT_SECRET: "a-desktop-secret-with-more-than-32-characters",
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "configured-password",
    EXTERNAL_ORDERS_BASE_URL: "https://orders.example.com",
    EXTERNAL_ORDERS_PHONE_NUMBER: "01234567890",
    EXTERNAL_ORDERS_PASSWORD: "external-password",
    DESKTOP_SYNC_ENABLED: "false",
    ...overrides,
  };
  fs.writeFileSync(
    filename,
    Object.entries(values)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n"),
  );
  return filename;
}

describe("desktop settings", () => {
  it("requires an explicit UUID branch before starting the local PC", () => {
    for (const BRANCH_ID of ["", "1", "not-a-branch"]) {
      expect(() => loadDesktopSettings(settings({ BRANCH_ID }))).toThrow(
        "BRANCH_ID",
      );
    }
    expect(loadDesktopSettings(settings()).branchId).toBe(
      "019a1234-5678-7000-8000-000000000001",
    );
  });
  it("does not require upstream credentials when synchronization is disabled", () => {
    expect(() =>
      loadDesktopSettings(
        settings({
          EXTERNAL_ORDERS_BASE_URL: "",
          EXTERNAL_ORDERS_PHONE_NUMBER: "",
          EXTERNAL_ORDERS_PASSWORD: "",
        }),
      ),
    ).not.toThrow();
  });
  it("loads local settings with all shell origins and disables proxy trust", () => {
    const loaded = loadDesktopSettings(settings());
    expect(loaded.environment.DATABASE_URL).toBe(
      "mysql://cashier:password@localhost:3306/cashier",
    );
    expect(loaded.environment.CORS_ORIGIN).toEqual([
      "http://localhost:3000",
      "http://tauri.localhost",
      "https://tauri.localhost",
      "tauri://localhost",
    ]);
    expect(loaded.environment.TRUST_PROXY).toBe(false);
    expect(loaded.syncEnabled).toBe(false);
    expect(loaded.admin.username).toBe("admin");
  });
  it("rejects a remote database in a fully local installation", () => {
    expect(() =>
      loadDesktopSettings(
        settings({
          DATABASE_URL: "mysql://cashier:password@remote.example/cashier",
        }),
      ),
    ).toThrow("local");
  });
  it("does not silently use the repository environment when settings are absent", () => {
    expect(() =>
      loadDesktopSettings(
        path.join(os.tmpdir(), "cashier-settings-file-does-not-exist.env"),
      ),
    ).toThrow("settings");
  });
  it("rejects an invalid synchronization switch", () => {
    expect(() =>
      loadDesktopSettings(settings({ DESKTOP_SYNC_ENABLED: "sometimes" })),
    ).toThrow("DESKTOP_SYNC_ENABLED");
  });
});
