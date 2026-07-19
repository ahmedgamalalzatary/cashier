import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { users } from "../src/db/schema.js";
import { createUser, loginAs } from "./helpers.js";
import { appOptions, db } from "./setup.js";

const app = () => createApp(db, appOptions);

describe("authentication", () => {
  it("logs in an active user and returns the safe profile", async () => {
    const credentials = await createUser("admin");
    const response = await request(app())
      .post("/api/auth/login")
      .send(credentials);
    expect(response.status).toBe(200);
    expect(response.body.token).toBeTypeOf("string");
    expect(response.body.user).toMatchObject({ name: "مدير", role: "admin" });
    expect(response.body.user).not.toHaveProperty("passwordHash");
  });

  it("rejects incorrect credentials without revealing which field failed", async () => {
    await createUser("admin");
    const unknown = await request(app())
      .post("/api/auth/login")
      .send({ username: "unknown", password: "secret123" });
    const wrong = await request(app())
      .post("/api/auth/login")
      .send({ username: "admin", password: "wrong" });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error).toBe(wrong.body.error);
  });

  it("rejects an inactive user", async () => {
    const credentials = await createUser("cashier");
    await db.update(users).set({ isActive: false });
    expect(
      (await request(app()).post("/api/auth/login").send(credentials)).status,
    ).toBe(401);
  });

  it("returns the authenticated user from /me", async () => {
    const authorization = await loginAs(app(), "cashier");
    const response = await request(app())
      .get("/api/auth/me")
      .set(authorization);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ name: "كاشير", role: "cashier" });
  });

  it("rejects a valid token after its user is deactivated", async () => {
    const authorization = await loginAs(app(), "cashier");
    await db.update(users).set({ isActive: false });

    const response = await request(app())
      .get("/api/auth/me")
      .set(authorization);
    expect(response.status).toBe(401);
  });

  it("rejects a valid token after its user is removed", async () => {
    const authorization = await loginAs(app(), "cashier");
    await db.delete(users);

    const response = await request(app())
      .get("/api/auth/me")
      .set(authorization);
    expect(response.status).toBe(401);
  });

  it("rejects missing and invalid bearer tokens", async () => {
    expect((await request(app()).get("/api/auth/me")).status).toBe(401);
    expect(
      (
        await request(app())
          .get("/api/auth/me")
          .set("Authorization", "Bearer invalid")
      ).status,
    ).toBe(401);
  });

  it("changes the authenticated user password after verifying the current one", async () => {
    const credentials = await createUser("cashier");
    const login = await request(app())
      .post("/api/auth/login")
      .send(credentials);
    const authorization = {
      Authorization: `Bearer ${login.body.token}`,
    };

    const changed = await request(app())
      .put("/api/auth/password")
      .set(authorization)
      .send({
        currentPassword: credentials.password,
        newPassword: "new-secret-456",
      });
    expect(changed.status).toBe(200);

    expect(
      (await request(app()).post("/api/auth/login").send(credentials)).status,
    ).toBe(401);
    expect(
      (
        await request(app()).post("/api/auth/login").send({
          username: credentials.username,
          password: "new-secret-456",
        })
      ).status,
    ).toBe(200);
  });

  it("rejects a password change when the current password is wrong", async () => {
    const authorization = await loginAs(app(), "cashier");
    const response = await request(app())
      .put("/api/auth/password")
      .set(authorization)
      .send({ currentPassword: "wrong", newPassword: "new-secret-456" });

    expect(response.status).toBe(400);
  });
});

describe("role protection", () => {
  it("allows admins to use admin endpoints", async () => {
    const authorization = await loginAs(app(), "admin");
    expect(
      (await request(app()).get("/api/categories").set(authorization)).status,
    ).toBe(200);
  });

  it("forbids cashiers from admin endpoints", async () => {
    const authorization = await loginAs(app(), "cashier");
    expect(
      (await request(app()).get("/api/categories").set(authorization)).status,
    ).toBe(403);
  });

  it("requires authentication for admin endpoints", async () => {
    expect((await request(app()).get("/api/suppliers")).status).toBe(401);
  });

  it("lets cashiers read cafe stock but not main-warehouse stock", async () => {
    const authorization = await loginAs(app(), "cashier");

    expect(
      (await request(app()).get("/api/inventory/cafe/stock").set(authorization))
        .status,
    ).toBe(200);
    expect(
      (await request(app()).get("/api/inventory/main/stock").set(authorization))
        .status,
    ).toBe(403);
  });
});
