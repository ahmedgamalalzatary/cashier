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
const plainAdmin = { ...superAdmin, id: testId(2), isSuperAdmin: false };

function dbFinding(user: typeof superAdmin) {
  return {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [user] }) }),
    }),
  } as unknown as Db;
}

const tokenFor = (user: typeof superAdmin) =>
  `Bearer ${signToken(user, 0, JWT_SECRET)}`;

describe("online link code permissions", () => {
  it("refuses minting a link code for an admin that is not the super-admin", async () => {
    const app = createApp(dbFinding(plainAdmin), options);

    const response = await request(app)
      .post("/api/link-codes")
      .set({ Authorization: tokenFor(plainAdmin) })
      .send({ branchId: testId(5) });

    expect(response.status).toBe(403);
  });

  it("requires a session before any link code request", async () => {
    const app = createApp(dbFinding(superAdmin), options);

    const response = await request(app)
      .post("/api/link-codes")
      .send({ branchId: testId(5) });

    expect(response.status).toBe(401);
  });

  it("rejects a link code request without a branch", async () => {
    const app = createApp(dbFinding(superAdmin), options);

    const response = await request(app)
      .post("/api/link-codes")
      .set({ Authorization: tokenFor(superAdmin) })
      .send({});

    expect(response.status).toBe(400);
  });
});
