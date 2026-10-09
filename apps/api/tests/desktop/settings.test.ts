import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadDesktopSettings } from "../../src/desktop/settings.js";

const directories: string[] = [];
const bundledUrl = "mysql://cashier:bundled@127.0.0.1:49152/cashier";
const load = (filename: string, databaseUrl = bundledUrl) =>
  loadDesktopSettings(filename, databaseUrl);

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    if (!directory.startsWith(path.join(os.tmpdir(), "cashier-settings-")))
      throw new Error("Unexpected test directory");
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function settings(overrides: Record<string, string | undefined> = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cashier-settings-"));
  directories.push(directory);
  const filename = path.join(directory, "settings.env");
  const values = {
    BRANCH_ID: "019a1234-5678-7000-8000-000000000001",
    DEVICE_TOKEN: "a-device-token-with-at-least-32-characters",
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
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n"),
  );
  return filename;
}

describe("desktop settings", () => {
  it("loads a linked PC without locally configured admin credentials", () => {
    const loaded = load(
      settings({
        ADMIN_USERNAME: undefined,
        ADMIN_PASSWORD: undefined,
        DEVICE_TOKEN: "a-device-token-with-at-least-32-characters",
      }),
    );
    expect(loaded.branchId).toBe("019a1234-5678-7000-8000-000000000001");
    expect(loaded).not.toHaveProperty("admin");
    expect(loaded).toMatchObject({
      deviceToken: "a-device-token-with-at-least-32-characters",
      onlineApiUrl: "https://cashier.biscofa.tech/api",
    });
  });
  it("requires the linked device token and refuses an insecure online address", () => {
    expect(() => load(settings({ DEVICE_TOKEN: undefined }))).toThrow(
      "DEVICE_TOKEN",
    );
    expect(() =>
      load(settings({ ONLINE_API_URL: "http://remote.example/api" })),
    ).toThrow("https");
  });
  it("requires an explicit UUID branch before starting the local PC", () => {
    for (const BRANCH_ID of ["1", "not-a-branch"]) {
      expect(() => load(settings({ BRANCH_ID }))).toThrow("BRANCH_ID");
    }
    expect(load(settings()).branchId).toBe(
      "019a1234-5678-7000-8000-000000000001",
    );
  });
  it("says plainly that an unlinked PC has no branch yet", () => {
    for (const BRANCH_ID of [undefined, ""]) {
      expect(() =>
        load(
          settings({
            BRANCH_ID,
            ADMIN_USERNAME: undefined,
            ADMIN_PASSWORD: undefined,
          }),
        ),
      ).toThrow("This PC is not linked yet");
    }
  });
  it("uses the bundled database and ignores an old DATABASE_URL", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const loaded = load(
      settings({ DATABASE_URL: "mysql://old:secret@localhost:3306/old" }),
    );
    expect(loaded.environment.DATABASE_URL).toBe(bundledUrl);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("DATABASE_URL");
    expect(String(warn.mock.calls[0][0])).not.toContain("secret");
  });
  it("refuses to start without the bundled database address", () => {
    expect(() => load(settings(), "")).toThrow("bundled database");
  });
  it("does not require upstream credentials when synchronization is disabled", () => {
    expect(() =>
      load(
        settings({
          EXTERNAL_ORDERS_BASE_URL: "",
          EXTERNAL_ORDERS_PHONE_NUMBER: "",
          EXTERNAL_ORDERS_PASSWORD: "",
        }),
      ),
    ).not.toThrow();
  });
  it("loads local settings with all shell origins and disables proxy trust", () => {
    const loaded = load(settings());
    expect(loaded.environment.DATABASE_URL).toBe(bundledUrl);
    expect(loaded.environment.CORS_ORIGIN).toEqual([
      "http://localhost:3000",
      "http://tauri.localhost",
      "https://tauri.localhost",
      "tauri://localhost",
    ]);
    expect(loaded.environment.TRUST_PROXY).toBe(false);
    expect(loaded.syncEnabled).toBe(false);
    expect(loaded.deviceToken).toBe(
      "a-device-token-with-at-least-32-characters",
    );
  });
  it("rejects a remote database in a fully local installation", () => {
    expect(() =>
      load(settings(), "mysql://cashier:password@remote.example/cashier"),
    ).toThrow("local");
  });
  it("does not silently use the repository environment when settings are absent", () => {
    expect(() =>
      load(path.join(os.tmpdir(), "cashier-settings-file-does-not-exist.env")),
    ).toThrow("settings");
  });
  it("rejects an invalid synchronization switch", () => {
    expect(() => load(settings({ DESKTOP_SYNC_ENABLED: "sometimes" }))).toThrow(
      "DESKTOP_SYNC_ENABLED",
    );
  });
});

describe("a PC that has just been linked", () => {
  /** Exactly what the desktop shell writes on a first start, then links. */
  function justLinked(overrides: Record<string, string | undefined> = {}) {
    return settings({
      EXTERNAL_ORDERS_BASE_URL: undefined,
      EXTERNAL_ORDERS_PHONE_NUMBER: undefined,
      EXTERNAL_ORDERS_PASSWORD: undefined,
      DESKTOP_SYNC_ENABLED: "false",
      ...overrides,
    });
  }

  it("starts without upstream credentials, because linking turned syncing off", () => {
    const loaded = load(justLinked());

    expect(loaded.syncEnabled).toBe(false);
    expect(loaded.branchId).toBe("019a1234-5678-7000-8000-000000000001");
    expect(loaded.deviceToken).toBe(
      "a-device-token-with-at-least-32-characters",
    );
  });

  it("keeps syncing on for a PC that was configured to use it", () => {
    const loaded = load(
      settings({
        DESKTOP_SYNC_ENABLED: "true",
        EXTERNAL_ORDERS_BASE_URL: "https://orders.example.com",
        EXTERNAL_ORDERS_PHONE_NUMBER: "01234567890",
        EXTERNAL_ORDERS_PASSWORD: "external-password",
      }),
    );

    expect(loaded.syncEnabled).toBe(true);
    expect(loaded.environment.EXTERNAL_ORDERS_BASE_URL).toBe(
      "https://orders.example.com",
    );
  });

  it("still asks for upstream credentials when a PC chose syncing without them", () => {
    expect(() =>
      load(
        settings({
          DESKTOP_SYNC_ENABLED: "true",
          EXTERNAL_ORDERS_BASE_URL: undefined,
        }),
      ),
    ).toThrow();
  });
});
