import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { appOptions, db } from "./setup.js";
import { createUser, loginAs } from "./helpers.js";

const app = () => createApp(db, appOptions);

describe("user management", () => {
  it("lets an admin create a cashier and lists only safe account fields", async () => {
    const authorization = await loginAs(app(), "admin");
    const created = await request(app())
      .post("/api/users")
      .set(authorization)
      .send({
        name: "كاشير مسائي",
        username: "evening-cashier",
        password: "secret-456",
        role: "cashier",
      });
    expect(created.status).toBe(201);

    const list = await request(app()).get("/api/users").set(authorization);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    expect(
      list.body.find((user: { id: number }) => user.id === created.body.id),
    ).toMatchObject({
      name: "كاشير مسائي",
      username: "evening-cashier",
      role: "cashier",
      isActive: true,
    });
    expect(list.body[0]).not.toHaveProperty("passwordHash");

    expect(
      (
        await request(app()).post("/api/auth/login").send({
          username: "evening-cashier",
          password: "secret-456",
        })
      ).status,
    ).toBe(200);
  });

  it("updates account details, activation, and password", async () => {
    const authorization = await loginAs(app(), "admin");
    await createUser("cashier", "till-one");
    const list = await request(app()).get("/api/users").set(authorization);
    const cashier = list.body.find(
      (user: { username: string }) => user.username === "till-one",
    );

    const updated = await request(app())
      .put(`/api/users/${cashier.id}`)
      .set(authorization)
      .send({ name: "كاشير أول", isActive: false });
    expect(updated.status).toBe(200);
    expect(
      (
        await request(app()).post("/api/auth/login").send({
          username: "till-one",
          password: "secret123",
        })
      ).status,
    ).toBe(401);

    expect(
      (
        await request(app())
          .put(`/api/users/${cashier.id}`)
          .set(authorization)
          .send({ isActive: true, password: "replacement-789" })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app()).post("/api/auth/login").send({
          username: "till-one",
          password: "replacement-789",
        })
      ).status,
    ).toBe(200);
  });

  it("rejects duplicate usernames and cashier access", async () => {
    const adminAuthorization = await loginAs(app(), "admin");
    await createUser("cashier", "existing");
    const duplicate = await request(app())
      .post("/api/users")
      .set(adminAuthorization)
      .send({
        name: "Duplicate",
        username: "existing",
        password: "secret-456",
        role: "cashier",
      });
    expect(duplicate.status).toBe(409);

    await createUser("cashier", "other");
    const cashierLogin = await request(app()).post("/api/auth/login").send({
      username: "other",
      password: "secret123",
    });
    const cashierAuthorization = {
      Authorization: `Bearer ${cashierLogin.body.token}`,
    };
    expect(
      (await request(app()).get("/api/users").set(cashierAuthorization)).status,
    ).toBe(403);
  });

  it("prevents an admin from deactivating or demoting their own account", async () => {
    const authorization = await loginAs(app(), "admin");
    const list = await request(app()).get("/api/users").set(authorization);
    const admin = list.body.find(
      (user: { username: string }) => user.username === "admin",
    );

    expect(
      (
        await request(app())
          .put(`/api/users/${admin.id}`)
          .set(authorization)
          .send({ isActive: false })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app())
          .put(`/api/users/${admin.id}`)
          .set(authorization)
          .send({ role: "cashier" })
      ).status,
    ).toBe(409);
  });
});
