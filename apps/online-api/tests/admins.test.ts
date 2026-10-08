import { testId } from "@cashier/shared/test-support";
import type { Db } from "@cashier/db";
import { signToken } from "@cashier/server-core";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const JWT_SECRET = "test-only-jwt-secret-at-least-32-characters";
const options = {
  jwtSecret: JWT_SECRET,
  corsOrigins: ["https://cashier.biscofa.tech"],
  trustProxy: true,
};

const superAdmin = {
  id: testId(1),
  name: "Owner",
  username: "owner",
  role: "admin",
  isActive: true,
  branchId: null,
  isSuperAdmin: true,
  tokenVersion: 0,
};
const plainAdmin = {
  ...superAdmin,
  id: testId(2),
  name: "Manager",
  username: "manager",
  isSuperAdmin: false,
};

/**
 * Only authentication reads the database here: the permission answer has to come
 * before any account query, so a fake that serves the signed-in account is enough
 * to prove who is refused.
 */
function dbFinding(user: typeof superAdmin) {
  return {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [user] }) }),
    }),
  } as unknown as Db;
}

const tokenFor = (user: typeof superAdmin) =>
  `Bearer ${signToken(user, 0, JWT_SECRET)}`;
const accountId = testId(9);

describe("online admin management", () => {
  it("refuses admin management from an admin that is not the super-admin", async () => {
    const app = createApp(dbFinding(plainAdmin), options);
    const auth = { Authorization: tokenFor(plainAdmin) };

    const listed = await request(app).get("/api/admins").set(auth);
    const created = await request(app).post("/api/admins").set(auth).send({
      name: "Manager",
      username: "manager2",
      role: "admin",
      password: "secret123",
    });
    const updated = await request(app)
      .put(`/api/admins/${accountId}`)
      .set(auth)
      .send({ name: "Renamed" });
    const assigned = await request(app)
      .put(`/api/admins/${accountId}/branches`)
      .set(auth)
      .send({ branchIds: [testId(5)] });

    expect([
      listed.status,
      created.status,
      updated.status,
      assigned.status,
    ]).toEqual([403, 403, 403, 403]);
  });

  it("requires a session before any admin account request", async () => {
    const app = createApp(dbFinding(superAdmin), options);

    const listed = await request(app).get("/api/admins");
    const created = await request(app).post("/api/admins").send({
      name: "Manager",
      username: "manager2",
      role: "admin",
      password: "secret123",
    });

    expect([listed.status, created.status]).toEqual([401, 401]);
  });
});
