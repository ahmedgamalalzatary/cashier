import { eq } from "drizzle-orm";
import { adminBranches, branches } from "@cashier/db";
import request from "supertest";
import { describe, expect } from "vitest";
import { it, testId } from "../support/ids.js";
import { createApp } from "../../../../apps/online-api/src/app.js";
import { db } from "../support/api-setup.js";
import { createUser } from "../support/api-helpers.js";

const onlineApp = createApp(db, {
  jwtSecret: process.env.JWT_SECRET,
  corsOrigins: ["https://cashier.biscofa.tech"],
});

type OnlineAuth = { Authorization: string };

async function loginAsAdmin(
  username: string,
  options: { isSuperAdmin?: boolean },
): Promise<OnlineAuth> {
  const creds = await createUser("admin", username, options);
  const res = await request(onlineApp).post("/api/auth/login").send(creds);
  return { Authorization: `Bearer ${res.body.token}` };
}

async function createBranch(name: string) {
  const [branch] = await db.insert(branches).values({ name }).$returningId();
  return branch.id;
}

const nameFor = (id: string) =>
  db
    .select({ name: branches.name })
    .from(branches)
    .where(eq(branches.id, id))
    .then((rows) => rows[0]?.name);

describe("online admin management", () => {
  it("creates an admin and assigns it several branches at once", async () => {
    const owner = await loginAsAdmin("owner", { isSuperAdmin: true });
    const north = await createBranch("فرع الشمال");
    const south = await createBranch("فرع الجنوب");

    const created = await request(onlineApp)
      .post("/api/admins")
      .set(owner)
      .send({
        name: "مدير الفروع",
        username: "branch-manager",
        role: "admin",
        password: "secret123",
        branchIds: [north, south],
      })
      .expect(201);

    const listed = await request(onlineApp)
      .get("/api/admins")
      .set(owner)
      .expect(200);
    const manager = listed.body.find(
      (row: { id: string }) => row.id === created.body.id,
    );
    const names = await Promise.all(manager.branchIds.map(nameFor));

    expect(manager.username).toBe("branch-manager");
    expect(names.sort()).toEqual(["فرع الشمال", "فرع الجنوب"].sort());
  });

  it("never returns a password hash to the online UI", async () => {
    const owner = await loginAsAdmin("owner", { isSuperAdmin: true });

    const listed = await request(onlineApp)
      .get("/api/admins")
      .set(owner)
      .expect(200);

    for (const row of listed.body)
      expect(Object.keys(row)).not.toContain("passwordHash");
  });

  it("lets the assigned admin read reports for that branch and no other", async () => {
    const owner = await loginAsAdmin("owner", { isSuperAdmin: true });
    const north = await createBranch("فرع الشمال");
    const south = await createBranch("فرع الجنوب");
    const created = await request(onlineApp)
      .post("/api/admins")
      .set(owner)
      .send({
        name: "مدير الشمال",
        username: "north-manager",
        role: "admin",
        password: "secret123",
        branchIds: [north],
      })
      .expect(201);

    // Sign in as the account the super-admin just created.
    const session = await request(onlineApp).post("/api/auth/login").send({
      role: "admin",
      username: "north-manager",
      password: "secret123",
    });
    const auth = { Authorization: `Bearer ${session.body.token}` };

    const allowed = await request(onlineApp)
      .get("/api/reports/dashboard")
      .set(auth)
      .set("X-Branch-Id", north)
      .expect(200);
    const refused = await request(onlineApp)
      .get("/api/reports/dashboard")
      .set(auth)
      .set("X-Branch-Id", south);

    expect(allowed.status).toBe(200);
    expect(refused.status).toBe(403);
    expect(created.body.id).not.toBe("");
  });

  it("replaces an admin's branches with the new set", async () => {
    const owner = await loginAsAdmin("owner", { isSuperAdmin: true });
    const north = await createBranch("فرع الشمال");
    const south = await createBranch("فرع الجنوب");
    const created = await request(onlineApp)
      .post("/api/admins")
      .set(owner)
      .send({
        name: "مدير",
        username: "reassign-me",
        role: "admin",
        password: "secret123",
        branchIds: [north],
      })
      .expect(201);

    await request(onlineApp)
      .put(`/api/admins/${created.body.id}/branches`)
      .set(owner)
      .send({ branchIds: [south] })
      .expect(200);
    const listed = await request(onlineApp)
      .get("/api/admins")
      .set(owner)
      .expect(200);
    const manager = listed.body.find(
      (row: { id: string }) => row.id === created.body.id,
    );

    expect(manager.branchIds).toEqual([south]);
  });

  it("ends the sessions of a deactivated admin", async () => {
    const owner = await loginAsAdmin("owner", { isSuperAdmin: true });
    const created = await request(onlineApp)
      .post("/api/admins")
      .set(owner)
      .send({
        name: "مدير",
        username: "to-disable",
        role: "admin",
        password: "secret123",
      })
      .expect(201);
    const session = await request(onlineApp).post("/api/auth/login").send({
      role: "admin",
      username: "to-disable",
      password: "secret123",
    });
    const auth = { Authorization: `Bearer ${session.body.token}` };
    const before = await request(onlineApp).get("/api/auth/me").set(auth);
    expect(before.status).toBe(200);

    await request(onlineApp)
      .put(`/api/admins/${created.body.id}`)
      .set(owner)
      .send({ isActive: false })
      .expect(200);

    const after = await request(onlineApp).get("/api/auth/me").set(auth);
    expect(after.status).toBe(401);
  });

  it("refuses admin management from an ordinary admin", async () => {
    const ordinary = await loginAsAdmin("ordinary", { isSuperAdmin: false });

    const listed = await request(onlineApp).get("/api/admins").set(ordinary);
    const created = await request(onlineApp)
      .post("/api/admins")
      .set(ordinary)
      .send({
        name: "Manager",
        username: "sneaky",
        role: "admin",
        password: "secret123",
      });

    expect([listed.status, created.status]).toEqual([403, 403]);
  });

  it("keeps the super-admin account out of reach", async () => {
    const owner = await loginAsAdmin("owner", { isSuperAdmin: true });
    const me = await request(onlineApp).get("/api/auth/me").set(owner);
    const ownId = me.body.id as string;

    const renamed = await request(onlineApp)
      .put(`/api/admins/${ownId}`)
      .set(owner)
      .send({ name: "New name" });
    const reassigned = await request(onlineApp)
      .put(`/api/admins/${ownId}/branches`)
      .set(owner)
      .send({ branchIds: [testId(1)] });

    expect([renamed.status, reassigned.status]).toEqual([409, 409]);
  });

  it("never touches the admin_branches of another admin", async () => {
    const owner = await loginAsAdmin("owner", { isSuperAdmin: true });
    const north = await createBranch("فرع الشمال");
    const first = await request(onlineApp)
      .post("/api/admins")
      .set(owner)
      .send({
        name: "أول",
        username: "first-admin",
        role: "admin",
        password: "secret123",
        branchIds: [north],
      })
      .expect(201);
    await request(onlineApp)
      .post("/api/admins")
      .set(owner)
      .send({
        name: "ثان",
        username: "second-admin",
        role: "admin",
        password: "secret123",
      })
      .expect(201);

    await request(onlineApp)
      .put(`/api/admins/${first.body.id}/branches`)
      .set(owner)
      .send({ branchIds: [] })
      .expect(200);

    const remaining = await db
      .select()
      .from(adminBranches)
      .where(eq(adminBranches.adminUserId, first.body.id));
    expect(remaining).toHaveLength(0);
  });
});
