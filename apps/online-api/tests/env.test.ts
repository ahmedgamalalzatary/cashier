import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadOnlineEnv, parseOnlineEnv } from "../src/env.js";

const valid = {
  DATABASE_URL: "mysql://cashier:password@localhost:3306/cashier_online",
  JWT_SECRET: "a-production-secret-with-at-least-32-characters",
  ADMIN_USERNAME: "super",
  ADMIN_PASSWORD: "server-only-password",
};

describe("online runtime environment", () => {
  it("parses the online settings without any external-system value", () => {
    expect(
      parseOnlineEnv({
        ...valid,
        PORT: "4001",
        CORS_ORIGIN: "https://cashier.biscofa.tech",
        TRUST_PROXY: "true",
      }),
    ).toMatchObject({
      DATABASE_URL: valid.DATABASE_URL,
      JWT_SECRET: valid.JWT_SECRET,
      PORT: 4001,
      CORS_ORIGIN: ["https://cashier.biscofa.tech"],
      TRUST_PROXY: true,
      ADMIN_USERNAME: "super",
    });
  });

  it("keeps listening on its own port and behind no proxy by default", () => {
    expect(parseOnlineEnv(valid)).toMatchObject({
      PORT: 4001,
      CORS_ORIGIN: ["http://localhost:3000"],
      TRUST_PROXY: false,
    });
  });

  it.each([
    [{ ...valid, DATABASE_URL: undefined }, "DATABASE_URL"],
    [{ ...valid, DATABASE_URL: "sqlite:///tmp/db" }, "DATABASE_URL"],
    [{ ...valid, JWT_SECRET: undefined }, "JWT_SECRET"],
    [{ ...valid, JWT_SECRET: "change-me" }, "JWT_SECRET"],
    [{ ...valid, CORS_ORIGIN: "https://cashier.biscofa.tech/api" }, "CORS_ORIGIN"],
    [{ ...valid, TRUST_PROXY: "yes" }, "TRUST_PROXY"],
    [{ ...valid, ADMIN_USERNAME: undefined }, "ADMIN_USERNAME"],
    [{ ...valid, ADMIN_PASSWORD: undefined }, "ADMIN_PASSWORD"],
  ])("rejects unsafe configuration %#", (environment, field) => {
    expect(() => parseOnlineEnv(environment)).toThrow(field);
  });

  it("loads the settings file the VPS passes in", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cashier-online-env-"));
    try {
      const envFile = path.join(dir, ".env.production");
      writeFileSync(
        envFile,
        Object.entries({ ...valid, PORT: "4020" })
          .map(([key, value]) => `${key}=${value}`)
          .join("\n"),
      );

      expect(loadOnlineEnv({ envFile, environment: {} })).toMatchObject({
        PORT: 4020,
        ADMIN_USERNAME: "super",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});