import { it } from "../support/ids.js";
import { describe, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../../../apps/api/src/app.js";
import { appOptions, db } from "../support/api-setup.js";
import { createUser, loginAs } from "../support/api-helpers.js";

const app = () => createApp(db, appOptions);

describe("user management", () => {
  it("lets the super-admin create another admin and lists safe account fields", async () => {
    const authorization = await loginAs(app(), "admin");
    const created = await request(app())
      .post("/api/users")
      .set(authorization)
      .send({
        name: "مدير مسائي",
        username: "evening-admin",
        password: "secret-456",
        role: "admin",
      });
    expect(created.status).toBe(201);

    const list = await request(app()).get("/api/users").set(authorization);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    expect(
      list.body.find((user: { id: string }) => user.id === created.body.id),
    ).toMatchObject({
      name: "مدير مسائي",
      username: "evening-admin",
      role: "admin",
      isActive: true,
      isSuperAdmin: false,
    });
    expect(
      list.body.find((user: { username: string }) => user.username === "admin"),
    ).toMatchObject({ isSuperAdmin: true });
    expect(list.body[0]).not.toHaveProperty("passwordHash");

    expect(
      (
        await request(app()).post("/api/auth/login").send({
          username: "evening-admin",
          password: "secret-456",
        })
      ).status,
    ).toBe(200);
  });

  it("updates account details, activation, and password", async () => {
    const authorization = await loginAs(app(), "admin");
    await createUser("admin", "manager-two");
    const list = await request(app()).get("/api/users").set(authorization);
    const managedAdmin = list.body.find(
      (user: { username: string }) => user.username === "manager-two",
    );

    const updated = await request(app())
      .put(`/api/users/${managedAdmin.id}`)
      .set(authorization)
      .send({ name: "مدير ثان", isActive: false });
    expect(updated.status).toBe(200);
    expect(
      (
        await request(app()).post("/api/auth/login").send({
          username: "manager-two",
          password: "secret123",
        })
      ).status,
    ).toBe(401);

    expect(
      (
        await request(app())
          .put(`/api/users/${managedAdmin.id}`)
          .set(authorization)
          .send({ isActive: true, password: "replacement-789" })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app()).post("/api/auth/login").send({
          username: "manager-two",
          password: "replacement-789",
        })
      ).status,
    ).toBe(200);
  });

  it("invalidates a user's existing token when the super-admin resets the password", async () => {
    const adminAuthorization = await loginAs(app(), "admin");
    const credentials = await createUser("admin", "reset-target");
    const login = await request(app())
      .post("/api/auth/login")
      .send(credentials);
    const userAuthorization = {
      Authorization: `Bearer ${login.body.token}`,
    };
    const list = await request(app()).get("/api/users").set(adminAuthorization);
    const managedAdmin = list.body.find(
      (user: { username: string }) => user.username === "reset-target",
    );

    expect(
      (
        await request(app())
          .put(`/api/users/${managedAdmin.id}`)
          .set(adminAuthorization)
          .send({ password: "replacement-789" })
      ).status,
    ).toBe(200);
    expect(
      (await request(app()).get("/api/auth/me").set(userAuthorization)).status,
    ).toBe(401);
  });

  it("requires cashier accounts and access to be managed through employees", async () => {
    const authorization = await loginAs(app(), "admin");
    await createUser("cashier", "linked-cashier");
    await createUser("admin", "manager-two");
    const list = await request(app()).get("/api/users").set(authorization);
    const cashier = list.body.find(
      (user: { username: string }) => user.username === "linked-cashier",
    );
    const managedAdmin = list.body.find(
      (user: { username: string }) => user.username === "manager-two",
    );

    expect(
      (
        await request(app())
          .put(`/api/users/${cashier.id}`)
          .set(authorization)
          .send({ isActive: false })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app())
          .put(`/api/users/${cashier.id}`)
          .set(authorization)
          .send({ role: "admin" })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app())
          .put(`/api/users/${managedAdmin.id}`)
          .set(authorization)
          .send({ role: "cashier" })
      ).status,
    ).toBe(409);
  });

  it("rejects duplicate usernames and cashier access to the page", async () => {
    const adminAuthorization = await loginAs(app(), "admin");
    await createUser("admin", "existing");
    const duplicate = await request(app())
      .post("/api/users")
      .set(adminAuthorization)
      .send({
        name: "Duplicate",
        username: "existing",
        password: "secret-456",
        role: "admin",
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

  it("keeps a regular admin read-only on the users page", async () => {
    const authorization = await loginAs(app(), "admin", {
      isSuperAdmin: false,
    });

    expect(
      (await request(app()).get("/api/users").set(authorization)).status,
    ).toBe(200);
    expect(
      (
        await request(app())
          .post("/api/users")
          .set(authorization)
          .send({
            name: "محاولة",
            username: "blocked",
            password: "secret-456",
            role: "admin",
          })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app())
          .put("/api/users/00000000-0000-7000-8000-000000000001")
          .set(authorization)
          .send({ name: "محاولة" })
      ).status,
    ).toBe(403);
  });

  it("prevents the super-admin from editing his own account", async () => {
    const authorization = await loginAs(app(), "admin");
    const list = await request(app()).get("/api/users").set(authorization);
    const admin = list.body.find(
      (user: { username: string }) => user.username === "admin",
    );

    for (const body of [
      { isActive: false },
      { role: "cashier" },
      { password: "replacement-789" },
      { name: "اسم آخر" },
    ]) {
      expect(
        (
          await request(app())
            .put(`/api/users/${admin.id}`)
            .set(authorization)
            .send(body)
        ).status,
      ).toBe(409);
    }
    expect(
      (await request(app()).get("/api/auth/me").set(authorization)).status,
    ).toBe(200);
  });
});
