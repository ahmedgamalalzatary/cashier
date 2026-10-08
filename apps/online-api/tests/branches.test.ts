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
 * before any branch query, so a fake that serves the signed-in account is enough
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

describe("online branch management", () => {
  it("refuses a branch write from an admin that is not the super-admin", async () => {
    const app = createApp(dbFinding(plainAdmin), options);
    const auth = { Authorization: tokenFor(plainAdmin) };
    const branchId = testId(9);

    const created = await request(app)
      .post("/api/branches")
      .set(auth)
      .send({ name: "New branch" });
    const renamed = await request(app)
      .put(`/api/branches/${branchId}`)
      .set(auth)
      .send({ name: "Renamed" });
    const archived = await request(app)
      .delete(`/api/branches/${branchId}`)
      .set(auth);

    expect([created.status, renamed.status, archived.status]).toEqual([
      403, 403, 403,
    ]);
  });

  it("requires a session before a branch write", async () => {
    const created = await request(createApp(dbFinding(superAdmin), options))
      .post("/api/branches")
      .send({ name: "New branch" });

    expect(created.status).toBe(401);
  });
});