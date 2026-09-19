import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler, HttpError } from "../../src/middleware/error.js";
import type { SuppliersController } from "../../src/modules/suppliers/suppliers.controller.js";
import { SuppliersController as RealSuppliersController } from "../../src/modules/suppliers/suppliers.controller.js";
import type { SuppliersService } from "../../src/modules/suppliers/suppliers.service.js";
import { suppliersRouter } from "../../src/modules/suppliers/suppliers.router.js";

function appWithStubs(controller: SuppliersController) {
  const app = express();
  app.use(express.json(), suppliersRouter(controller));
  app.use(errorHandler);
  return app;
}

function stubController() {
  const ok = vi.fn((_req: unknown, res: { json: (body: unknown) => void }) =>
    res.json({ ok: true }),
  );
  const created = vi.fn(
    (_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) =>
      res.status(201).json({ ok: true }),
  );
  return {
    list: vi.fn(ok),
    get: vi.fn(ok),
    create: vi.fn(created),
    update: vi.fn(ok),
    deactivate: vi.fn(ok),
    addPayment: vi.fn(created),
    statement: vi.fn(ok),
  } as unknown as SuppliersController;
}

describe("supplier routes", () => {
  it("dispatches all seven supplier routes to the controller", async () => {
    const controller = stubController();
    const app = appWithStubs(controller);

    const responses = await Promise.all([
      request(app).get("/"),
      request(app).post("/").send({}),
      request(app).get("/1"),
      request(app).put("/1").send({}),
      request(app).delete("/1"),
      request(app).post("/1/payments").send({}),
      request(app).get("/1/statement"),
    ]);

    expect(responses.every(({ status }) => status !== 404)).toBe(true);
    for (const handler of [
      controller.list,
      controller.create,
      controller.get,
      controller.update,
      controller.deactivate,
      controller.addPayment,
      controller.statement,
    ]) {
      expect(handler).toHaveBeenCalledTimes(1);
    }
  });
});

describe("supplier controller wiring", () => {
  it("creates and pays with 201 and parsed bodies", async () => {
    const service = {
      create: vi.fn(async () => 4),
      addPayment: vi.fn(async () => 9),
    } as unknown as SuppliersService;
    const app = appWithStubs(new RealSuppliersController(service));

    const created = await request(app).post("/").send({
      name: "المورد",
      openingBalance: 0,
    });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: 4 });

    const paid = await request(app).post("/1/payments").send({
      amount: 25,
      paidAt: "2026-07-19",
    });
    expect(paid.status).toBe(201);
    expect(paid.body).toEqual({ id: 9 });
    expect(service.addPayment).toHaveBeenCalledWith(1, {
      amount: 25,
      paidAt: "2026-07-19",
    });
  });

  it("maps bad bodies and ids to 400 and missing suppliers to 404", async () => {
    const service = {
      getOrFail: vi
        .fn()
        .mockRejectedValue(new HttpError(404, "المورد غير موجود")),
    } as unknown as SuppliersService;
    const app = appWithStubs(new RealSuppliersController(service));

    expect((await request(app).post("/").send({})).status).toBe(400);
    expect((await request(app).put("/abc").send({ name: "x" })).status).toBe(
      400,
    );
    expect(
      (await request(app).post("/1/payments").send({ amount: -5 })).status,
    ).toBe(400);

    const missing = await request(app).get("/999");
    expect(missing.status).toBe(404);
  });
});
