import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { appOptions, db } from "../../support/setup.js";
import { loginAs } from "../../support/helpers.js";

const app = () => createApp(db, appOptions);

describe("employees", () => {
  it("rejects cashier attempts to grant cashier access", async () => {
    const authorization = await loginAs(app(), "cashier");

    const response = await request(app())
      .post("/api/employees/1/cashier-access")
      .set(authorization)
      .send({ username: "forbidden", password: "secret123" });

    expect(response.status).toBe(403);
  });

  it("lets an admin list employee records", async () => {
    const authorization = await loginAs(app(), "admin");

    const response = await request(app())
      .get("/api/employees")
      .set(authorization);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("creates an employee record without login or PIN credentials", async () => {
    const authorization = await loginAs(app(), "admin");

    const created = await request(app())
      .post("/api/employees")
      .set(authorization)
      .send({
        name: "أحمد حسن",
        phone: "01000000000",
        jobTitle: "كاشير",
        hireDate: "2026-07-01",
        payType: "monthly",
        payRate: 6000,
        notes: "فترة مسائية",
      });

    expect(created.status).toBe(201);
    const listed = await request(app())
      .get("/api/employees")
      .set(authorization);
    expect(listed.body).toEqual([
      expect.objectContaining({
        id: created.body.id,
        name: "أحمد حسن",
        phone: "01000000000",
        jobTitle: "كاشير",
        hireDate: "2026-07-01",
        payType: "monthly",
        payRate: "6000.00",
        notes: "فترة مسائية",
        isActive: true,
        cashierAccess: null,
      }),
    ]);
    expect(listed.body[0]).not.toHaveProperty("pin");
  });

  it("grants an employee linked cashier login access", async () => {
    const authorization = await loginAs(app(), "admin");
    const employee = await request(app())
      .post("/api/employees")
      .set(authorization)
      .send({ name: "منى علي" });

    const granted = await request(app())
      .post(`/api/employees/${employee.body.id}/cashier-access`)
      .set(authorization)
      .send({ username: "mona", password: "secret123" });

    expect(granted.status).toBe(201);
    const login = await request(app())
      .post("/api/auth/login")
      .send({ username: "mona", password: "secret123" });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({
      id: granted.body.userId,
      name: "منى علي",
      role: "cashier",
    });

    const listed = await request(app())
      .get("/api/employees")
      .set(authorization);
    expect(listed.body[0].cashierAccess).toEqual({
      userId: granted.body.userId,
      username: "mona",
      isActive: true,
    });
  });

  it("revokes cashier login without deleting the employee or linked user", async () => {
    const authorization = await loginAs(app(), "admin");
    const employee = await request(app())
      .post("/api/employees")
      .set(authorization)
      .send({ name: "سلمى محمد" });
    const granted = await request(app())
      .post(`/api/employees/${employee.body.id}/cashier-access`)
      .set(authorization)
      .send({ username: "salma", password: "secret123" });

    const revoked = await request(app())
      .delete(`/api/employees/${employee.body.id}/cashier-access`)
      .set(authorization);

    expect(revoked.status).toBe(204);
    const login = await request(app())
      .post("/api/auth/login")
      .send({ username: "salma", password: "secret123" });
    expect(login.status).toBe(401);
    const listed = await request(app())
      .get("/api/employees")
      .set(authorization);
    expect(listed.body[0]).toMatchObject({
      id: employee.body.id,
      isActive: true,
      cashierAccess: {
        userId: granted.body.userId,
        username: "salma",
        isActive: false,
      },
    });
  });

  it("restores a revoked cashier using the original linked user", async () => {
    const authorization = await loginAs(app(), "admin");
    const employee = await request(app())
      .post("/api/employees")
      .set(authorization)
      .send({ name: "ياسر سامي" });
    const firstGrant = await request(app())
      .post(`/api/employees/${employee.body.id}/cashier-access`)
      .set(authorization)
      .send({ username: "yasser-old", password: "secret123" });
    await request(app())
      .delete(`/api/employees/${employee.body.id}/cashier-access`)
      .set(authorization);

    const restored = await request(app())
      .post(`/api/employees/${employee.body.id}/cashier-access`)
      .set(authorization)
      .send({ username: "yasser", password: "newsecret123" });

    expect(restored.status).toBe(200);
    expect(restored.body.userId).toBe(firstGrant.body.userId);
    const login = await request(app())
      .post("/api/auth/login")
      .send({ username: "yasser", password: "newsecret123" });
    expect(login.status).toBe(200);
  });

  it("updates the employee profile and keeps the linked cashier name in sync", async () => {
    const authorization = await loginAs(app(), "admin");
    const employee = await request(app())
      .post("/api/employees")
      .set(authorization)
      .send({ name: "اسم قديم", jobTitle: "كاشير" });
    await request(app())
      .post(`/api/employees/${employee.body.id}/cashier-access`)
      .set(authorization)
      .send({ username: "renamed", password: "secret123" });

    const updated = await request(app())
      .put(`/api/employees/${employee.body.id}`)
      .set(authorization)
      .send({
        name: "اسم جديد",
        phone: "01111111111",
        jobTitle: "مشرف كاشير",
      });

    expect(updated.status).toBe(200);
    const login = await request(app())
      .post("/api/auth/login")
      .send({ username: "renamed", password: "secret123" });
    expect(login.body.user.name).toBe("اسم جديد");
  });

  it("rejects creating a standalone cashier through system-user management", async () => {
    const authorization = await loginAs(app(), "admin");

    const response = await request(app())
      .post("/api/users")
      .set(authorization)
      .send({
        name: "حساب منفصل",
        username: "standalone",
        password: "secret123",
        role: "cashier",
      });

    expect(response.status).toBe(400);
  });

  it("does not revoke cashier access while that employee has an open shift", async () => {
    const authorization = await loginAs(app(), "admin");
    const employee = await request(app())
      .post("/api/employees")
      .set(authorization)
      .send({ name: "كاشير مشغول" });
    await request(app())
      .post(`/api/employees/${employee.body.id}/cashier-access`)
      .set(authorization)
      .send({ username: "busy", password: "secret123" });
    const login = await request(app())
      .post("/api/auth/login")
      .send({ username: "busy", password: "secret123" });
    await request(app())
      .post("/api/shifts/open")
      .set({ Authorization: `Bearer ${login.body.token}` })
      .send({ openingFloat: 0 });

    const response = await request(app())
      .delete(`/api/employees/${employee.body.id}/cashier-access`)
      .set(authorization);

    expect(response.status).toBe(409);
  });

  it("soft-deactivates an employee and their linked cashier access", async () => {
    const authorization = await loginAs(app(), "admin");
    const employee = await request(app())
      .post("/api/employees")
      .set(authorization)
      .send({ name: "موظف سابق" });
    await request(app())
      .post(`/api/employees/${employee.body.id}/cashier-access`)
      .set(authorization)
      .send({ username: "former", password: "secret123" });

    const response = await request(app())
      .delete(`/api/employees/${employee.body.id}`)
      .set(authorization);

    expect(response.status).toBe(204);
    const listed = await request(app())
      .get("/api/employees")
      .set(authorization);
    expect(listed.body[0]).toMatchObject({
      id: employee.body.id,
      isActive: false,
      cashierAccess: { isActive: false },
    });
    expect(
      (
        await request(app())
          .post("/api/auth/login")
          .send({ username: "former", password: "secret123" })
      ).status,
    ).toBe(401);
  });

  it("reactivates an employee record without silently restoring cashier access", async () => {
    const authorization = await loginAs(app(), "admin");
    const employee = await request(app())
      .post("/api/employees")
      .set(authorization)
      .send({ name: "موظف عائد" });
    await request(app())
      .post(`/api/employees/${employee.body.id}/cashier-access`)
      .set(authorization)
      .send({ username: "returning", password: "secret123" });
    await request(app())
      .delete(`/api/employees/${employee.body.id}`)
      .set(authorization);

    const response = await request(app())
      .put(`/api/employees/${employee.body.id}`)
      .set(authorization)
      .send({ isActive: true });

    expect(response.status).toBe(200);
    const listed = await request(app())
      .get("/api/employees")
      .set(authorization);
    expect(listed.body[0]).toMatchObject({
      isActive: true,
      cashierAccess: { isActive: false },
    });
  });
});
