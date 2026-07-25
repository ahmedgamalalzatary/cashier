import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { EmployeesController } from "../../../../src/modules/employees/employees.controller.js";
import { employeesRouter } from "../../../../src/modules/employees/employees.router.js";

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
