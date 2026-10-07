import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadRuntimeEnv, parseRuntimeEnv, rootDir } from "../../src/env.js";

const valid = {
  DATABASE_URL: "mysql://cashier:password@localhost:3306/cashier",
  JWT_SECRET: "a-production-secret-with-at-least-32-characters",
  PORT: "4000",
  CORS_ORIGIN: "http://localhost:3000",
  EXTERNAL_ORDERS_BASE_URL: "https://orders.example.com",
  EXTERNAL_ORDERS_PHONE_NUMBER: "01234567890",
  EXTERNAL_ORDERS_PASSWORD: "server-only-password",
};

describe("runtime environment", () => {
  it("accepts web, Windows/Android, and macOS/iOS/Linux Tauri origins together", () => {
    expect(
      parseRuntimeEnv({
        ...valid,
        CORS_ORIGIN:
          "http://localhost:3000,http://tauri.localhost,https://tauri.localhost,tauri://localhost",
      }).CORS_ORIGIN,
    ).toEqual([
      "http://localhost:3000",
      "http://tauri.localhost",
      "https://tauri.localhost",
      "tauri://localhost",
    ]);
  });
  it("keeps catalog refresh enabled by default and accepts explicitly disabling it", () => {
    expect(parseRuntimeEnv(valid).EXTERNAL_CATALOG_ENABLED).toBe(true);
    expect(
      parseRuntimeEnv({ ...valid, EXTERNAL_CATALOG_ENABLED: "false" })
        .EXTERNAL_CATALOG_ENABLED,
    ).toBe(false);
    expect(() =>
      parseRuntimeEnv({ ...valid, EXTERNAL_CATALOG_ENABLED: "no" }),
    ).toThrow("EXTERNAL_CATALOG_ENABLED");
  });
  it("loads injected environment variables when the env file is absent", () => {
    expect(
      loadRuntimeEnv({
        envFile: path.join(rootDir, ".env.docker-missing-test"),
        environment: { ...valid, PORT: "4321" },
      }),
    ).toMatchObject({
      DATABASE_URL: valid.DATABASE_URL,
      JWT_SECRET: valid.JWT_SECRET,
      PORT: 4321,
      CORS_ORIGIN: [valid.CORS_ORIGIN],
      EXTERNAL_ORDERS_BASE_URL: valid.EXTERNAL_ORDERS_BASE_URL,
      EXTERNAL_ORDERS_PHONE_NUMBER: valid.EXTERNAL_ORDERS_PHONE_NUMBER,
    });
  });

  it("parses and normalizes a complete valid configuration", () => {
    expect(parseRuntimeEnv(valid)).toMatchObject({
      DATABASE_URL: valid.DATABASE_URL,
      JWT_SECRET: valid.JWT_SECRET,
      PORT: 4000,
      CORS_ORIGIN: [valid.CORS_ORIGIN],
      EXTERNAL_ORDERS_BASE_URL: valid.EXTERNAL_ORDERS_BASE_URL,
      EXTERNAL_ORDERS_PHONE_NUMBER: valid.EXTERNAL_ORDERS_PHONE_NUMBER,
    });
  });

  it("parses multiple comma-separated CORS origins", () => {
    expect(
      parseRuntimeEnv({
        ...valid,
        CORS_ORIGIN: "https://cashier.bittech.site, http://localhost:3000",
      }).CORS_ORIGIN,
    ).toEqual(["https://cashier.bittech.site", "http://localhost:3000"]);
  });

  it("loads and accepts a complete .env file from disk", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cashier-env-"));
    const envFile = path.join(dir, ".env");
    try {
      writeFileSync(
        envFile,
        Object.entries(valid)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n"),
      );
      const loaded = loadRuntimeEnv({ envFile, environment: {} });

      expect(loaded.DATABASE_URL).toBe(valid.DATABASE_URL);
      expect(loaded.CORS_ORIGIN).toEqual([valid.CORS_ORIGIN]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    [{ ...valid, DATABASE_URL: undefined }, "DATABASE_URL"],
    [{ ...valid, DATABASE_URL: "not-a-url" }, "DATABASE_URL"],
    [{ ...valid, JWT_SECRET: undefined }, "JWT_SECRET"],
    [{ ...valid, JWT_SECRET: "change-me" }, "JWT_SECRET"],
    [{ ...valid, PORT: "70000" }, "PORT"],
    [{ ...valid, CORS_ORIGIN: "not-an-origin" }, "CORS_ORIGIN"],
    [{ ...valid, CORS_ORIGIN: "tauri://evil.example" }, "CORS_ORIGIN"],
    [{ ...valid, CORS_ORIGIN: "tauri://localhost/path" }, "CORS_ORIGIN"],
    [{ ...valid, CORS_ORIGIN: `${valid.CORS_ORIGIN},` }, "CORS_ORIGIN"],
    [
      { ...valid, EXTERNAL_ORDERS_BASE_URL: undefined },
      "EXTERNAL_ORDERS_BASE_URL",
    ],
    [
      { ...valid, EXTERNAL_ORDERS_BASE_URL: "not-a-url" },
      "EXTERNAL_ORDERS_BASE_URL",
    ],
    [
      { ...valid, EXTERNAL_ORDERS_BASE_URL: "https://orders.example.com/api/" },
      "EXTERNAL_ORDERS_BASE_URL",
    ],
    [
      { ...valid, EXTERNAL_ORDERS_BASE_URL: "http://orders.example.com" },
      "EXTERNAL_ORDERS_BASE_URL",
    ],
    [
      { ...valid, EXTERNAL_ORDERS_PHONE_NUMBER: undefined },
      "EXTERNAL_ORDERS_PHONE_NUMBER",
    ],
    [
      { ...valid, EXTERNAL_ORDERS_PASSWORD: undefined },
      "EXTERNAL_ORDERS_PASSWORD",
    ],
  ])("rejects unsafe configuration %#", (environment, field) => {
    expect(() => parseRuntimeEnv(environment)).toThrow(field);
  });
});
