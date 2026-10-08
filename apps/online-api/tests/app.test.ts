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

const admin = {
  id: testId(1),
  name: "Manager",
  username: "manager",
  role: "admin",
  isActive: true,
  branchId: null,
  isSuperAdmin: true,
  tokenVersion: 0,
};
const cashier = {
  id: testId(2),
  name: "Cashier",
  username: "cashier",
  role: "cashier",
  isActive: true,
  branchId: testId(9),
  isSuperAdmin: false,
  tokenVersion: 0,
};

/** The online API only reads the signed-in account while authenticating. */
function dbFinding(user: typeof admin | typeof cashier) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [user] }),
      }),
    }),
  } as unknown as Db;
}

const tokenFor = (user: typeof admin | typeof cashier) =>
  `Bearer ${signToken(user, 0, JWT_SECRET)}`;

describe("online API surface", () => {
  it("reports health without authentication", async () => {
    const res = await request(createApp(dbFinding(admin), options)).get(
      "/health",
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("allows only the configured online-web origin", async () => {
    const app = createApp(dbFinding(admin), options);

    const allowed = await request(app)
      .options("/health")
      .set("Origin", options.corsOrigins[0]);
    const denied = await request(app)
      .options("/health")
      .set("Origin", "https://evil.example");

    expect(allowed.headers["access-control-allow-origin"]).toBe(
      options.corsOrigins[0],
    );
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("serves a session to an admin", async () => {
    const res = await request(createApp(dbFinding(admin), options))
      .get("/api/auth/me")
      .set("Authorization", tokenFor(admin));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: admin.id,
      name: admin.name,
      role: "admin",
      branchId: null,
      isSuperAdmin: true,
    });
  });

  it("refuses a cashier session that already exists", async () => {
    const res = await request(createApp(dbFinding(cashier), options))
      .get("/api/auth/me")
      .set("Authorization", tokenFor(cashier));

    expect(res.status).toBe(401);
  });

  it("requires a session for the branch picker", async () => {
    const res = await request(createApp(dbFinding(admin), options)).get(
      "/api/branches",
    );

    expect(res.status).toBe(401);
  });

  it("exposes no branch write route", async () => {
    const app = createApp(dbFinding(admin), options);
    const token = { Authorization: tokenFor(admin) };
    const branchId = testId(9);

    const created = await request(app)
      .post("/api/branches")
      .set(token)
      .send({ name: "New branch" });
    const renamed = await request(app)
      .put(`/api/branches/${branchId}`)
      .set(token)
      .send({ name: "Renamed" });
    const archived = await request(app)
      .delete(`/api/branches/${branchId}`)
      .set(token);

    expect([created.status, renamed.status, archived.status]).toEqual([
      404, 404, 404,
    ]);
  });

  it("requires an explicit branch selection before reports", async () => {
    const res = await request(createApp(dbFinding(admin), options))
      .get("/api/reports/dashboard")
      .set("Authorization", tokenFor(admin));

    expect(res.status).toBe(400);
  });
});