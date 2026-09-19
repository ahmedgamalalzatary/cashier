import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler, HttpError } from "../../src/middleware/error.js";
import type { EmployeesController } from "../../src/modules/employees/employees.controller.js";
import { EmployeesController as RealEmployeesController } from "../../src/modules/employees/employees.controller.js";
import type { EmployeesService } from "../../src/modules/employees/employees.service.js";
import { employeesRouter } from "../../src/modules/employees/employees.router.js";

describe("employee route authorization", () => {
  it("applies the admin guard to every employee route", async () => {
    const controller = {
      list: vi.fn((_req, res) => res.status(200).end()),
      create: vi.fn((_req, res) => res.status(201).end()),
      update: vi.fn((_req, res) => res.status(200).end()),
      grantCashierAccess: vi.fn((_req, res) => res.status(201).end()),
      revokeCashierAccess: vi.fn((_req, res) => res.status(204).end()),
      deactivate: vi.fn((_req, res) => res.status(204).end()),
    } as unknown as EmployeesController;
    const app = express();
    app.use((req, _res, next) => {
      req.user = { id: 1, name: "Cashier", role: "cashier" };
      next();
    });
    app.use(express.json(), employeesRouter(controller));

    const responses = await Promise.all([
      request(app).get("/"),
      request(app).post("/").send({}),
      request(app).put("/1").send({}),
      request(app).post("/1/cashier-access").send({}),
      request(app).delete("/1/cashier-access"),
      request(app).delete("/1"),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([
      403, 403, 403, 403, 403, 403,
    ]);
    expect(controller.list).not.toHaveBeenCalled();
    expect(controller.create).not.toHaveBeenCalled();
    expect(controller.update).not.toHaveBeenCalled();
    expect(controller.grantCashierAccess).not.toHaveBeenCalled();
    expect(controller.revokeCashierAccess).not.toHaveBeenCalled();
    expect(controller.deactivate).not.toHaveBeenCalled();
  });
});

describe("employee controller wiring", () => {
  function appWithService(service: EmployeesService) {
    const app = express();
    app.use((req, _res, next) => {
      req.user = { id: 1, name: "Admin", role: "admin" };
      next();
    });
    app.use(express.json(), employeesRouter(new RealEmployeesController(service)));
    app.use(errorHandler);
    return app;
  }

  const validEmployee = { name: "أحمد", payType: "monthly", payRate: 5000 };

  it("uses 201 for creates and grants, 204 for revokes and deactivations", async () => {
    const service = {
      create: vi.fn(async () => 1),
      grantCashierAccess: vi.fn(async () => ({ userId: 11, created: true })),
      revokeCashierAccess: vi.fn(async () => undefined),
      deactivate: vi.fn(async () => undefined),
    } as unknown as EmployeesService;
    const app = appWithService(service);

    const created = await request(app).post("/").send(validEmployee);
    expect(created.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(validEmployee);

    const granted = await request(app).post("/1/cashier-access").send({
      username: "c1",
      password: "secret-123",
    });
    expect(granted.status).toBe(201);
    expect(granted.body).toEqual({ userId: 11 });

    const restoredService = {
      grantCashierAccess: vi.fn(async () => ({ userId: 11, created: false })),
    } as unknown as EmployeesService;
    const restored = await request(appWithService(restoredService))
      .post("/1/cashier-access")
      .send({ username: "c1", password: "secret-123" });
    expect(restored.status).toBe(200);

    expect((await request(app).delete("/1/cashier-access")).status).toBe(204);
    expect((await request(app).delete("/1")).status).toBe(204);
  });

  it("maps bad bodies and ids to 400 and missing rows to 404", async () => {
    const service = {
      update: vi
        .fn()
        .mockRejectedValue(new HttpError(404, "الموظف غير موجود")),
    } as unknown as EmployeesService;
    const app = appWithService(service);

    expect((await request(app).post("/").send({})).status).toBe(400);
    expect((await request(app).put("/1").send({})).status).toBe(400);
    expect(
      (
        await request(app)
          .post("/1/cashier-access")
          .send({ username: "c1", password: "short" })
      ).status,
    ).toBe(400);
    expect((await request(app).put("/abc").send({ name: "x" })).status).toBe(
      400,
    );

    const missing = await request(app).put("/999").send({ name: "x" });
    expect(missing.status).toBe(404);
  });
});
