import { it } from "../support/ids.js";
import { describe, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../../../apps/api/src/app.js";
import { users } from "@cashier/db";
import { createUser, loginAs } from "../support/api-helpers.js";
import { appOptions, db } from "../support/api-setup.js";

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

  it("sets the auth token as an HttpOnly cookie on login", async () => {
    const credentials = await createUser("admin");
    const response = await request(app())
      .post("/api/auth/login")
      .send(credentials);

    expect(response.status).toBe(200);
    const cookies = response.headers["set-cookie"] ?? [];
    expect(
      cookies.some((cookie: string) =>
        /cashier\.token=.+;.*HttpOnly/i.test(cookie),
      ),
    ).toBe(true);
  });

  it("authenticates requests carrying only the auth cookie", async () => {
    const credentials = await createUser("cashier");
    const login = await request(app())
      .post("/api/auth/login")
      .send(credentials);
    const cookie = (login.headers["set-cookie"] ?? []).find(
      (entry: string) => entry.startsWith("cashier.token="),
    );
    expect(cookie).toBeTypeOf("string");

    const response = await request(app())
      .get("/api/auth/me")
      .set("Cookie", cookie!);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ name: "كاشير", role: "cashier" });
  });

  it("clears the auth cookie on logout", async () => {
    const authorization = await loginAs(app(), "cashier");
    const response = await request(app())
      .post("/api/auth/logout")
      .set(authorization);

    expect(response.status).toBe(200);
    const cookies = response.headers["set-cookie"] ?? [];
    expect(
      cookies.some((cookie: string) =>
        /cashier\.token=;.*Expires=Thu, 01 Jan 1970/i.test(cookie),
      ),
    ).toBe(true);
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

  it("forbids cashiers from reading and creating purchases", async () => {
    const authorization = await loginAs(app(), "cashier");

    expect(
      (await request(app()).get("/api/purchases").set(authorization)).status,
    ).toBe(403);
    expect(
      (
        await request(app())
          .post("/api/purchases")
          .set(authorization)
          .send({})
      ).status,
    ).toBe(403);
  });

  it("forbids cashiers from reading suppliers", async () => {
    const authorization = await loginAs(app(), "cashier");

    expect(
      (await request(app()).get("/api/suppliers").set(authorization)).status,
    ).toBe(403);
  });

  it("still lets admins read purchases and suppliers", async () => {
    const authorization = await loginAs(app(), "admin");

    expect(
      (await request(app()).get("/api/purchases").set(authorization)).status,
    ).toBe(200);
    expect(
      (await request(app()).get("/api/suppliers").set(authorization)).status,
    ).toBe(200);
  });
});
