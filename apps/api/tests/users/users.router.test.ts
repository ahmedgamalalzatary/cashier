import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler, HttpError } from "../../src/middleware/error.js";
import type { UsersController } from "../../src/modules/users/users.controller.js";
import { UsersController as RealUsersController } from "../../src/modules/users/users.controller.js";
import type { UsersService } from "../../src/modules/users/users.service.js";
import { usersRouter } from "../../src/modules/users/users.router.js";

function appWithStubs(controller: UsersController) {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: 7, name: "Admin", role: "admin" };
    next();
  });
  app.use(express.json(), usersRouter(controller));
  app.use(errorHandler);
  return app;
}

describe("user routes", () => {
  it("dispatches list, create, and update to the controller", async () => {
    const controller = {
      list: vi.fn((_req, res) => res.json([])),
      create: vi.fn((_req, res) => res.status(201).json({ id: 3 })),
      update: vi.fn((_req, res) => res.json({ ok: true })),
    } as unknown as UsersController;
    const app = appWithStubs(controller);

    const [list, created, updated] = await Promise.all([
      request(app).get("/"),
      request(app).post("/").send({
        name: "مدير",
        username: "admin-two",
        role: "admin",
        password: "password-123",
      }),
      request(app).put("/3").send({ name: "جديد" }),
    ]);

    expect(list.status).toBe(200);
    expect(created.status).toBe(201);
    expect(updated.status).toBe(200);
    expect(controller.list).toHaveBeenCalledTimes(1);
    expect(controller.create).toHaveBeenCalledTimes(1);
    expect(controller.update).toHaveBeenCalledTimes(1);
  });
});

describe("user controller wiring", () => {
  it("creates with the parsed body and updates with actor, id, and changes", async () => {
    const service = {
      create: vi.fn(async () => 3),
      update: vi.fn(async () => undefined),
    } as unknown as UsersService;
    const app = appWithStubs(new RealUsersController(service));

    const created = await request(app).post("/").send({
      name: "مدير",
      username: "admin-two",
      role: "admin",
      password: "password-123",
    });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: 3 });

    const updated = await request(app).put("/3").send({ name: "جديد" });
    expect(updated.status).toBe(200);
    expect(service.update).toHaveBeenCalledWith(7, 3, { name: "جديد" });
  });

  it("maps empty bodies and bad ids to 400 and missing users to 404", async () => {
    const service = {
      update: vi
        .fn()
        .mockRejectedValue(new HttpError(404, "المستخدم غير موجود")),
    } as unknown as UsersService;
    const app = appWithStubs(new RealUsersController(service));

    expect((await request(app).put("/3").send({})).status).toBe(400);
    expect((await request(app).put("/abc").send({ name: "x" })).status).toBe(
      400,
    );
    expect(
      (
        await request(app).post("/").send({
          name: "مدير",
          username: "admin-two",
          role: "cashier",
          password: "password-123",
        })
      ).status,
    ).toBe(400);

    const missing = await request(app).put("/999").send({ name: "x" });
    expect(missing.status).toBe(404);
  });
});
