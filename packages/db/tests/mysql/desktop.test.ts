import { it, testBranchValues } from "../support/ids.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, vi } from "vitest";
import { db } from "../support/api-setup.js";
import { loadTestEnvironment } from "../support/index.js";
import { startDesktopApi } from "../../../../apps/api/src/desktop/runtime.js";
import { employees, users, shifts } from "@cashier/db";
import { eq } from "drizzle-orm";

const directories: string[] = [];
const running: Awaited<ReturnType<typeof startDesktopApi>>[] = [];
afterEach(async () => {
  for (const runtime of running.splice(0)) await runtime.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    if (!directory.startsWith(path.join(os.tmpdir(), "cashier-desktop-db-")))
      throw new Error("Unexpected test directory");
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

async function start(sync = false) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "cashier-desktop-db-"),
  );
  directories.push(directory);
  const settings = path.join(directory, "settings.env");
  const manifest = path.join(directory, "manifest.json");
  const [rows] = await db.$client.query(
    "SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1",
  );
  const createdAt = (rows as Array<{ created_at: number }>)[0].created_at;
  fs.writeFileSync(
    manifest,
    JSON.stringify({ schemaCreatedAt: Number(createdAt) }),
  );
  fs.writeFileSync(
    settings,
    Object.entries({
      DATABASE_URL: loadTestEnvironment(),
      JWT_SECRET: "desktop-test-secret-more-than-32-characters",
      ADMIN_USERNAME: "desktop-test-admin",
      ADMIN_PASSWORD: "desktop-test-password",
      DESKTOP_SYNC_ENABLED: String(sync),
      EXTERNAL_ORDERS_BASE_URL: "https://offline.example",
      EXTERNAL_ORDERS_PHONE_NUMBER: "01234567890",
      EXTERNAL_ORDERS_PASSWORD: "offline-password",
    })
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n"),
  );
  const runtime = await startDesktopApi(
    settings,
    manifest,
    new AbortController().signal,
  );
  running.push(runtime);
  return runtime;
}

describe("owned desktop API", () => {
  it("closes expired shifts without any UI request when external sync is disabled", async () => {
    const [employee] = await db.insert(employees).values(testBranchValues({ name: "Expired desktop shift" })).$returningId();
    const [cashier] = await db.insert(users).values(testBranchValues({
      employeeId: employee.id, name: "Desktop cashier", username: "desktop-expired",
      passwordHash: "unused", role: "cashier",
    })).$returningId();
    const [shift] = await db.insert(shifts).values(testBranchValues({
      cashierUserId: cashier.id, employeeId: employee.id,
      openedAt: new Date(Date.now() - 17 * 3_600_000), openingFloat: "100.00", openSlot: 1,
    })).$returningId();
    await start(false);
    await vi.waitFor(async () => {
      const [row] = await db.select().from(shifts).where(eq(shifts.id, shift.id));
      expect(row.status).toBe("closed");
      expect(row.actualCash).toBeNull();
    }, { timeout: 1_000 });
  });
  it("starts independently, logs in without cookies, and stops its local listener", async () => {
    const runtime = await start();
    expect(runtime.apiUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(await (await fetch(runtime.apiUrl + "/health")).json()).toEqual({
      ok: true,
    });
    const login = await fetch(runtime.apiUrl + "/api/auth/login", {
      method: "POST",
      headers: {
        Origin: "http://tauri.localhost",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "desktop-test-admin",
        password: "desktop-test-password",
      }),
    });
    expect(login.headers.get("access-control-allow-origin")).toBe(
      "http://tauri.localhost",
    );
    const session = await login.json();
    const me = await fetch(runtime.apiUrl + "/api/auth/me", {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      id: session.user.id,
      role: "admin",
      isSuperAdmin: true,
    });
    await runtime.close();
    await expect(fetch(runtime.apiUrl + "/health")).rejects.toThrow();
  });
  it("does not reuse or stop another API instance's port", async () => {
    const first = await start();
    const second = await start();
    expect(first.apiUrl).not.toBe(second.apiUrl);
    await first.close();
    expect((await fetch(second.apiUrl + "/health")).status).toBe(200);
  });
  it("remains available when background syncing has no internet", async () => {
    const clientFetch = fetch;
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Internet unavailable");
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const runtime = await start(true);
    expect(
      await (await clientFetch(runtime.apiUrl + "/health")).json(),
    ).toEqual({ ok: true });
  });
});
