import { it, TEST_BRANCH_ID, testId } from "../support/ids.js";
import { describe, expect } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import {
  adminBranches,
  branches,
  currentBranchId,
  users,
  withBranch,
} from "@cashier/db";
import { createApp } from "../../../../apps/api/src/app.js";
import { appOptions, db } from "../support/api-setup.js";
import { createUser } from "../support/api-helpers.js";
import { refreshActiveBranches } from "../../../../apps/api/src/modules/external/cache-refresh.module.js";

const pinned = (branchId = TEST_BRANCH_ID) =>
  createApp(db, { ...appOptions, branchId });
async function signIn(app: ReturnType<typeof pinned>, credentials: object) {
  return request(app).post("/api/auth/login").send(credentials);
}

describe("local branch login", () => {
  it("allows an assigned admin without a branch header and exposes only the pinned branch", async () => {
    const credentials = await createUser("admin", "assigned");
    await db.insert(branches).values({ id: testId(900), name: "Other" });
    const app = pinned();
    const login = await signIn(app, credentials);
    expect(login.status).toBe(200);
    const token = { Authorization: `Bearer ${login.body.token}` };
    expect((await request(app).get("/api/categories").set(token)).status).toBe(
      200,
    );
    const listed = await request(app).get("/api/branches").set(token);
    expect(listed.status).toBe(200);
    expect(listed.body.map((row: { id: string }) => row.id)).toEqual([
      TEST_BRANCH_ID,
    ]);
    expect(
      (
        await request(app)
          .post("/api/branches")
          .set(token)
          .send({ name: "Forbidden" })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .put(`/api/branches/${TEST_BRANCH_ID}`)
          .set(token)
          .send({ name: "Forbidden" })
      ).status,
    ).toBe(403);
    expect(
      (await request(app).delete(`/api/branches/${TEST_BRANCH_ID}`).set(token))
        .status,
    ).toBe(403);
  });
  it("rejects a cashier from a different branch at login and on an existing token", async () => {
    const other = testId(900);
    await db.insert(branches).values({ id: other, name: "Other" });
    const credentials = await withBranch(other, () =>
      createUser("cashier", "other-cashier"),
    );
    const login = await signIn(pinned(other), credentials);
    expect(login.status).toBe(200);
    expect((await signIn(pinned(), credentials)).status).toBe(401);
    expect(
      (
        await request(pinned())
          .get("/api/auth/me")
          .set("Authorization", `Bearer ${login.body.token}`)
      ).status,
    ).toBe(403);
  });
  it("rejects invalid headers while allowing the configured UUID", async () => {
    const credentials = await createUser("admin", "super", {
      isSuperAdmin: true,
    });
    const app = pinned();
    const login = await signIn(app, credentials);
    for (const header of ["1", "invalid"]) {
      expect(
        (
          await request(app)
            .get("/api/categories")
            .set("Authorization", `Bearer ${login.body.token}`)
            .set("X-Branch-Id", header)
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await request(app)
          .get("/api/categories")
          .set("Authorization", `Bearer ${login.body.token}`)
          .set("X-Branch-Id", TEST_BRANCH_ID)
      ).status,
    ).toBe(200);
  });
  it("blocks an archived cashier's new login and existing session while allowing admin history", async () => {
    const credentials = await createUser("cashier", "archived");
    const admin = await createUser("admin", "super", { isSuperAdmin: true });
    const app = pinned();
    const login = await signIn(app, credentials);
    const adminLogin = await signIn(app, admin);
    await db
      .update(branches)
      .set({ isActive: false })
      .where(eq(branches.id, TEST_BRANCH_ID));
    expect((await signIn(app, credentials)).status).toBe(401);
    expect(
      (
        await request(app)
          .get("/api/auth/me")
          .set("Authorization", `Bearer ${login.body.token}`)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get("/api/categories")
          .set("Authorization", `Bearer ${adminLogin.body.token}`)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post("/api/categories")
          .set("Authorization", `Bearer ${adminLogin.body.token}`)
          .send({ name: "Blocked", parentId: null })
      ).status,
    ).toBe(409);
  });
  it("refreshes only the configured PC branch even if another active branch appears", async () => {
    await db.insert(branches).values({ id: testId(900), name: "Other" });
    const refreshed: string[] = [];
    await refreshActiveBranches(
      db,
      {
        runDue: async () => {
          refreshed.push(currentBranchId());
          return true;
        },
      },
      undefined,
      undefined,
      TEST_BRANCH_ID,
    );
    expect(refreshed).toEqual([TEST_BRANCH_ID]);
  });
  it("skips external refresh when the configured branch is archived", async () => {
    await db
      .update(branches)
      .set({ isActive: false })
      .where(eq(branches.id, TEST_BRANCH_ID));
    await db.insert(branches).values({ id: testId(900), name: "Other" });
    const refreshed: string[] = [];
    await refreshActiveBranches(
      db,
      {
        runDue: async () => {
          refreshed.push(currentBranchId());
          return true;
        },
      },
      undefined,
      undefined,
      TEST_BRANCH_ID,
    );
    expect(refreshed).toEqual([]);
  });
  it("selects admin and cashier independently when both share a username and password", async () => {
    await createUser("admin", "ali", { isSuperAdmin: true });
    await createUser("cashier", "ali");
    for (const role of ["admin", "cashier"] as const) {
      const response = await signIn(pinned(), {
        username: "ali",
        password: "secret123",
        role,
      });
      expect(response.status).toBe(200);
      expect(response.body.user.role).toBe(role);
    }
  });

  it("rejects an unassigned admin on the PC", async () => {
    const credentials = await createUser("admin", "unassigned");
    await db.delete(adminBranches);
    expect(
      (await signIn(pinned(), { ...credentials, role: "admin" })).status,
    ).toBe(403);
  });

  it("refuses an attempt to select another branch even for the super-admin", async () => {
    const credentials = await createUser("admin", "super", {
      isSuperAdmin: true,
    });
    const login = await signIn(pinned(), { ...credentials, role: "admin" });
    await db.insert(branches).values({ id: testId(900), name: "Other" });
    const response = await request(pinned())
      .get("/api/categories")
      .set("Authorization", `Bearer ${login.body.token}`)
      .set("X-Branch-Id", testId(900));
    expect(response.status).toBe(403);
  });

  it("rejects an existing session immediately after its branch assignment is removed", async () => {
    const credentials = await createUser("admin", "assigned");
    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.username, "assigned"));
    await db
      .insert(adminBranches)
      .values({ adminUserId: admin.id, branchId: TEST_BRANCH_ID })
      .onDuplicateKeyUpdate({ set: { adminUserId: admin.id } });
    const app = pinned();
    const login = await signIn(app, { ...credentials, role: "admin" });
    expect(login.status).toBe(200);
    await db.delete(adminBranches);
    expect(
      (
        await request(app)
          .get("/api/auth/me")
          .set("Authorization", `Bearer ${login.body.token}`)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get("/api/categories")
          .set("Authorization", `Bearer ${login.body.token}`)
      ).status,
    ).toBe(403);
  });

  it("chooses the correct same-name cashier on each pinned PC and rejects ambiguous unpinned login", async () => {
    const other = testId(900);
    await db.insert(branches).values({ id: other, name: "Other" });
    await createUser("cashier", "ali");
    await withBranch(other, () => createUser("cashier", "ali"));
    for (const branchId of [TEST_BRANCH_ID, other]) {
      const response = await signIn(pinned(branchId), {
        username: "ali",
        password: "secret123",
        role: "cashier",
      });
      expect(response.status).toBe(200);
      expect(response.body.user.branchId).toBe(branchId);
    }
    expect(
      (
        await signIn(createApp(db, appOptions), {
          username: "ali",
          password: "secret123",
          role: "cashier",
        })
      ).status,
    ).toBe(401);
  });
});
