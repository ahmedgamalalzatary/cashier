import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import request from "supertest";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { vi } from "vitest";
import {
  adminBranches,
  branches,
  devices,
  users,
  uuidv7,
  closeDb,
  createDb,
  type Db,
} from "@cashier/db";
import { loadTestEnvironment, migrationsFolder } from "../support/test-env.js";
import { createApp as onlineApp } from "../../../../apps/online-api/src/app.js";
import { createApp as localApp } from "../../../../apps/api/src/app.js";
import { hashDeviceToken } from "../../../../packages/server-core/src/modules/devices/device-link.service.js";
import { applyDeviceAccounts } from "../../../../apps/api/src/desktop/accounts.js";
import { startDesktopApi } from "../../../../apps/api/src/desktop/runtime.js";

const branchId = uuidv7();
const otherBranchId = uuidv7();
const superId = uuidv7();
const adminId = uuidv7();
const otherAdminId = uuidv7();
const token = "device-accounts-test-token-with-32-characters";
const secret = "device-accounts-test-jwt-secret-over-32-characters";
const passwordHash = bcrypt.hashSync("secret123", 4);
let online: Db;
let local: Db;
let localUrl: string;
const owned: Array<{ db: Db; name: string; owner: mysql.Connection }> = [];
const directories: string[] = [];

beforeAll(async () => {
  for (const side of ["online", "local"]) {
    const name = `cashier_accounts_${side}_${process.pid}_${Date.now()}_test`;
    const owner = await mysql.createConnection(loadTestEnvironment());
    try {
      await owner.query("CREATE DATABASE ?? CHARACTER SET utf8mb4", [name]);
    } catch (error) {
      await owner.end();
      throw error;
    }
    const url = loadTestEnvironment({ databaseName: name });
    const db = createDb(url);
    owned.push({ db, name, owner });
    await migrate(db, { migrationsFolder });
    if (side === "online") online = db;
    else {
      local = db;
      localUrl = url;
    }
  }
}, 90_000);

afterAll(async () => {
  for (const { db, name, owner } of owned.reverse()) {
    await closeDb(db);
    await owner.query("DROP DATABASE ??", [name]);
    await owner.end();
  }
});

beforeEach(async () => {
  for (const db of [online, local]) {
    const connection = await db.$client.getConnection();
    try {
      await connection.query("SET FOREIGN_KEY_CHECKS = 0");
      for (const table of [
        "sync_outbox",
        "sync_state",
        "sync_ingest_events",
        "sync_ingest_rows",
        "sync_ingest_pending",
        "admin_branches",
        "devices",
        "users",
        "branches",
      ])
        await connection.query(`DELETE FROM \`${table}\``);
    } finally {
      await connection.query("SET FOREIGN_KEY_CHECKS = 1");
      connection.release();
    }
  }
  await online.insert(branches).values([
    {
      id: branchId,
      name: "Linked branch",
      createdAt: new Date("2026-10-08T00:00:00.000Z"),
    },
    { id: otherBranchId, name: "Other branch" },
  ]);
  await online.insert(users).values([
    {
      id: superId,
      name: "Owner",
      username: "owner",
      role: "admin",
      isSuperAdmin: true,
      passwordHash,
    },
    {
      id: adminId,
      name: "Manager",
      username: "manager",
      role: "admin",
      passwordHash,
    },
    {
      id: otherAdminId,
      name: "Other manager",
      username: "other-manager",
      role: "admin",
      passwordHash,
    },
  ]);
  await online.insert(adminBranches).values([
    { adminUserId: adminId, branchId },
    { adminUserId: adminId, branchId: otherBranchId },
    { adminUserId: otherAdminId, branchId: otherBranchId },
  ]);
  await online
    .insert(devices)
    .values({ branchId, tokenHash: hashDeviceToken(token) });
  await local
    .insert(branches)
    .values({ id: branchId, name: "Old branch name" });
});

afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (
      !directory.startsWith(path.join(os.tmpdir(), "cashier-accounts-runtime-"))
    )
      throw new Error("Unexpected accounts test directory");
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function site() {
  return onlineApp(online, { jwtSecret: secret, corsOrigins: [] });
}

async function accounts() {
  return (
    await request(site())
      .get("/api/device/accounts")
      .set("Authorization", `Device ${token}`)
      .expect(200)
  ).body;
}

describe("device accounts", () => {
  it("returns only its branch, its assigned admins and the super-admin with hashes", async () => {
    await online.insert(users).values({
      id: uuidv7(),
      branchId,
      name: "Cashier",
      username: "manager",
      role: "cashier",
      passwordHash,
    });
    await online
      .update(users)
      .set({ isActive: false, tokenVersion: 7 })
      .where(eq(users.id, adminId));
    const response = await request(site())
      .get("/api/device/accounts")
      .set("Authorization", `Device ${token}`)
      .set("X-Branch-Id", otherBranchId)
      .set("X-Cashier-Version", "0.3.0")
      .expect(200);
    expect(response.body.branch).toMatchObject({
      id: branchId,
      name: "Linked branch",
      isActive: true,
    });
    expect(response.body.branch.createdAt).toBe("2026-10-08T00:00:00.000Z");
    expect(
      response.body.users.map((user: { id: string }) => user.id).sort(),
    ).toEqual([superId, adminId].sort());
    expect(
      response.body.users.find((user: { id: string }) => user.id === adminId),
    ).toEqual({
      id: adminId,
      name: "Manager",
      username: "manager",
      passwordHash,
      role: "admin",
      isSuperAdmin: false,
      isActive: false,
      tokenVersion: 7,
    });
    expect(response.body.adminBranches).toEqual([
      { adminUserId: adminId, branchId },
    ]);
    expect(JSON.stringify(response.body)).not.toContain("secret123");
    const [device] = await online.select().from(devices);
    expect(device.appVersion).toBe("0.3.0");
    expect(device.lastSeenAt).not.toBeNull();
  });

  it("rejects revoked devices and ordinary admin sessions", async () => {
    await online.delete(devices);
    await request(site())
      .get("/api/device/accounts")
      .set("Authorization", `Device ${token}`)
      .expect(401);
    const session = await request(site())
      .post("/api/auth/login")
      .send({ username: "owner", password: "secret123", role: "admin" })
      .expect(200);
    await request(site())
      .get("/api/device/accounts")
      .set("Authorization", `Bearer ${session.body.token}`)
      .expect(401);
  });
});

describe("applying downloaded accounts", () => {
  it("rolls back duplicate admin usernames instead of overwriting an identity", async () => {
    const snapshot = await accounts();
    snapshot.users[1].username = snapshot.users[0].username;
    await expect(
      applyDeviceAccounts(local, branchId, snapshot),
    ).rejects.toThrow();
    expect(await local.select().from(users)).toHaveLength(0);
    expect((await local.select().from(branches))[0].name).toBe(
      "Old branch name",
    );
  });
  it("copies hashes and branch state, preserves cashiers and revokes removed admins", async () => {
    const removedId = uuidv7();
    const cashierId = uuidv7();
    await local.insert(users).values([
      {
        id: removedId,
        name: "Removed",
        username: "removed",
        role: "admin",
        passwordHash,
      },
      {
        id: cashierId,
        branchId,
        name: "Cashier",
        username: "manager",
        role: "cashier",
        passwordHash,
      },
    ]);
    await local
      .insert(adminBranches)
      .values({ adminUserId: removedId, branchId });
    await online
      .update(branches)
      .set({ isActive: false })
      .where(eq(branches.id, branchId));
    await applyDeviceAccounts(local, branchId, await accounts());
    expect(
      await local
        .select({
          id: branches.id,
          name: branches.name,
          isActive: branches.isActive,
        })
        .from(branches),
    ).toEqual([{ id: branchId, name: "Linked branch", isActive: false }]);
    expect(
      (await local.select().from(branches))[0].createdAt.toISOString(),
    ).toBe("2026-10-08T00:00:00.000Z");
    const localUsers = await local.select().from(users);
    expect(localUsers.find((user) => user.id === cashierId)).toMatchObject({
      role: "cashier",
      isActive: true,
      passwordHash,
    });
    expect(localUsers.find((user) => user.id === removedId)).toMatchObject({
      isActive: false,
    });
    expect(localUsers.find((user) => user.id === adminId)).toMatchObject({
      passwordHash,
      branchId: null,
      employeeId: null,
    });
    expect(await local.select().from(adminBranches)).toEqual([
      { adminUserId: adminId, branchId },
    ]);
  });

  it("propagates password and assignment changes into local login and existing sessions", async () => {
    await applyDeviceAccounts(local, branchId, await accounts());
    const app = localApp(local, {
      jwtSecret: secret,
      corsOrigins: [],
      branchId,
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ role: "admin", username: "manager", password: "secret123" })
      .expect(200);
    await online
      .update(users)
      .set({
        passwordHash: bcrypt.hashSync("changed-password", 4),
        tokenVersion: 1,
      })
      .where(eq(users.id, adminId));
    await applyDeviceAccounts(local, branchId, await accounts());
    await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(401);
    await request(app)
      .post("/api/auth/login")
      .send({ role: "admin", username: "manager", password: "secret123" })
      .expect(401);
    await request(app)
      .post("/api/auth/login")
      .send({
        role: "admin",
        username: "manager",
        password: "changed-password",
      })
      .expect(200);
    await online
      .delete(adminBranches)
      .where(eq(adminBranches.branchId, branchId));
    await applyDeviceAccounts(local, branchId, await accounts());
    await request(app)
      .post("/api/auth/login")
      .send({
        role: "admin",
        username: "manager",
        password: "changed-password",
      })
      .expect(401);
  });

  it("rejects a foreign branch or cashier identity collision without changing local state", async () => {
    const snapshot = await accounts();
    await expect(
      applyDeviceAccounts(local, branchId, {
        ...snapshot,
        branch: { ...snapshot.branch, id: otherBranchId },
      }),
    ).rejects.toThrow();
    await local.insert(users).values({
      id: adminId,
      branchId,
      name: "Cashier",
      username: "local-cashier",
      role: "cashier",
      passwordHash,
    });
    await expect(
      applyDeviceAccounts(local, branchId, snapshot),
    ).rejects.toThrow();
    expect(await local.select({ name: branches.name }).from(branches)).toEqual([
      { name: "Old branch name" },
    ]);
    expect(await local.select({ role: users.role }).from(users)).toEqual([
      { role: "cashier" },
    ]);
  });

  it("handles admin username swaps without changing their identities", async () => {
    await online
      .insert(adminBranches)
      .values({ adminUserId: otherAdminId, branchId });
    await applyDeviceAccounts(local, branchId, await accounts());
    await online
      .update(users)
      .set({ username: "temporary" })
      .where(eq(users.id, adminId));
    await online
      .update(users)
      .set({ username: "manager" })
      .where(eq(users.id, otherAdminId));
    await online
      .update(users)
      .set({ username: "other-manager" })
      .where(eq(users.id, adminId));
    await applyDeviceAccounts(local, branchId, await accounts());
    expect(
      (await local.select().from(users).where(eq(users.id, adminId)))[0]
        .username,
    ).toBe("other-manager");
    expect(
      (await local.select().from(users).where(eq(users.id, otherAdminId)))[0]
        .username,
    ).toBe("manager");
  });

  it("suppresses outbox echoes on the transaction connection and clears the flag after failure", async () => {
    await local.execute(`CREATE TRIGGER accounts_echo_probe AFTER INSERT ON users FOR EACH ROW
      BEGIN IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
        INSERT INTO sync_outbox (table_name, op, pk) VALUES ('users', 'upsert', JSON_OBJECT('id', NEW.id));
      END IF; END`);
    try {
      await applyDeviceAccounts(local, branchId, await accounts());
      const [echoes] = await local.$client.query(
        "SELECT COUNT(*) AS count FROM sync_outbox",
      );
      expect((echoes as Array<{ count: number }>)[0].count).toBe(0);
      await local.execute(
        "CREATE TRIGGER accounts_failure_probe BEFORE UPDATE ON branches FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced apply failure'",
      );
      try {
        await expect(
          applyDeviceAccounts(local, branchId, await accounts()),
        ).rejects.toThrow();
        const [flags] = await local.$client.query(
          "SELECT @cashier_sync_apply AS flag",
        );
        expect((flags as Array<{ flag: number }>)[0].flag).toBe(0);
      } finally {
        await local.execute("DROP TRIGGER accounts_failure_probe");
      }
    } finally {
      await local.execute("DROP TRIGGER accounts_echo_probe");
    }
  });
});

describe("desktop accounts lifecycle", () => {
  async function start(apiUrl: string) {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "cashier-accounts-runtime-"),
    );
    directories.push(directory);
    const settings = path.join(directory, "settings.env");
    fs.writeFileSync(
      settings,
      Object.entries({
        BRANCH_ID: branchId,
        DEVICE_TOKEN: token,
        JWT_SECRET: secret,
        ONLINE_API_URL: apiUrl,
        DESKTOP_SYNC_ENABLED: "false",
        // Obsolete local credentials must never overwrite downloaded accounts.
        ADMIN_USERNAME: "owner",
        ADMIN_PASSWORD: "wrong-local-password",
      })
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join("\n"),
    );
    const [rows] = await local.$client.query(
      "SELECT MAX(created_at) AS checkpoint FROM __drizzle_migrations",
    );
    const manifest = path.join(directory, "manifest.json");
    fs.writeFileSync(
      manifest,
      JSON.stringify({
        version: "0.3.0",
        schemaCreatedAt: Number(
          (rows as Array<{ checkpoint: number }>)[0].checkpoint,
        ),
      }),
    );
    return startDesktopApi(
      settings,
      manifest,
      new AbortController().signal,
      localUrl,
    );
  }

  it("starts pulling from the real online API and makes assigned admins available for login", async () => {
    const server = site().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as { port: number };
    let runtime: Awaited<ReturnType<typeof startDesktopApi>> | undefined;
    try {
      runtime = await start(`http://127.0.0.1:${address.port}/api`);
      await vi.waitFor(
        async () => {
          const login = await fetch(`${runtime!.apiUrl}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role: "admin",
              username: "manager",
              password: "secret123",
            }),
          });
          expect(login.status).toBe(200);
        },
        { timeout: 5_000 },
      );
      expect(
        (await local.select().from(users).where(eq(users.id, superId)))[0]
          .passwordHash,
      ).toBe(passwordHash);
    } finally {
      await runtime?.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("serves cached accounts offline and ignores obsolete local admin passwords", async () => {
    await applyDeviceAccounts(local, branchId, await accounts());
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let runtime: Awaited<ReturnType<typeof startDesktopApi>> | undefined;
    try {
      runtime = await start("http://127.0.0.1:1/api");
      const login = await fetch(`${runtime.apiUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "admin",
          username: "owner",
          password: "secret123",
        }),
      });
      expect(login.status).toBe(200);
    } finally {
      await runtime?.close();
      errors.mockRestore();
    }
  });
});
