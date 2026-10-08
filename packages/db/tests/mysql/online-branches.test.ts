import { currentBranchId } from "@cashier/db";
import request from "supertest";
import { describe, expect } from "vitest";
import { it } from "../support/ids.js";
import { createApp } from "../../../../apps/online-api/src/app.js";
import { db } from "../support/api-setup.js";
import { createUser } from "../support/api-helpers.js";

// Branch management on the online site: the only writes the deployment accepts.
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

async function createBranch(auth: OnlineAuth, name: string) {
  const res = await request(onlineApp)
    .post("/api/branches")
    .set(auth)
    .send({ name })
    .expect(201);
  return res.body as { id: string; name: string; isActive: boolean };
}

describe("online branch management", () => {
  it("creates a branch and offers it to the super-admin", async () => {
    const auth = await loginAsAdmin("owner", { isSuperAdmin: true });

    const created = await request(onlineApp)
      .post("/api/branches")
      .set(auth)
      .send({ name: "فرع أونلاين" })
      .expect(201);
    const listed = await request(onlineApp)
      .get("/api/branches")
      .set(auth)
      .expect(200);

    expect(created.body.isActive).toBe(true);
    expect(listed.body.map((branch) => branch.id)).toContain(created.body.id);
  });

  it("renames a branch for the super-admin", async () => {
    const auth = await loginAsAdmin("owner", { isSuperAdmin: true });
    const branch = await createBranch(auth, "اسم قديم");

    const renamed = await request(onlineApp)
      .put(`/api/branches/${branch.id}`)
      .set(auth)
      .send({ name: "اسم جديد" })
      .expect(200);

    expect(renamed.body.name).toBe("اسم جديد");
  });

  it("archives a branch without deleting its record", async () => {
    const auth = await loginAsAdmin("owner", { isSuperAdmin: true });
    const branch = await createBranch(auth, "فرع سيتم أرشفته");

    const archived = await request(onlineApp)
      .delete(`/api/branches/${branch.id}`)
      .set(auth)
      .expect(200);
    const listed = await request(onlineApp)
      .get("/api/branches")
      .set(auth)
      .expect(200);

    expect(archived.body.isActive).toBe(false);
    expect(listed.body.map((row) => row.id)).toContain(branch.id);
  });

  it("reopens an archived branch for the super-admin", async () => {
    const auth = await loginAsAdmin("owner", { isSuperAdmin: true });
    const branch = await createBranch(auth, "فرع يعود للعمل");
    await request(onlineApp)
      .delete(`/api/branches/${branch.id}`)
      .set(auth)
      .expect(200);

    const reopened = await request(onlineApp)
      .put(`/api/branches/${branch.id}`)
      .set(auth)
      .send({ isActive: true })
      .expect(200);

    expect(reopened.body.isActive).toBe(true);
  });

  it("keeps the new branch out of an ordinary admin's list", async () => {
    const owner = await loginAsAdmin("owner", { isSuperAdmin: true });
    await createBranch(owner, "فرع مدير");
    const manager = await loginAsAdmin("manager", { isSuperAdmin: false });

    const listed = await request(onlineApp)
      .get("/api/branches")
      .set(manager)
      .expect(200);

    expect(listed.body.map((branch) => branch.id)).toEqual([currentBranchId()]);
  });
});

