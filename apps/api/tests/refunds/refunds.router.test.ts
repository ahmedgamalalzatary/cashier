import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler, HttpError } from "../../src/middleware/error.js";
import type { RefundsController } from "../../src/modules/refunds/refunds.controller.js";
import { RefundsController as RealRefundsController } from "../../src/modules/refunds/refunds.controller.js";
import type { RefundsService } from "../../src/modules/refunds/refunds.service.js";
import { refundsRouter } from "../../src/modules/refunds/refunds.router.js";

function appWithStubs(controller: RefundsController, role = "cashier") {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: 9, name: "Cashier", role };
    next();
  });
  app.use(express.json(), refundsRouter(controller));
  app.use(errorHandler);
  return app;
}

function stubController(
  overrides: Partial<Record<keyof RefundsController, unknown>> = {},
) {
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
    quantities: vi.fn(ok),
    create: vi.fn(created),
    ...overrides,
  } as unknown as RefundsController;
}

const validBody = {
  clientRequestId: "8f345091-c497-4b8b-b4f3-a8ebdc47dd31",
  orderId: 10,
  reason: "طلب العميل",
  lines: [{ orderLineId: 1, quantity: 2, stockAction: null }],
};

describe("refund route authorization", () => {
  it("blocks non-cashiers from creating refunds", async () => {
    const controller = stubController();

    const response = await request(appWithStubs(controller, "admin"))
      .post("/")
      .send(validBody);

    expect(response.status).toBe(403);
    expect(controller.create).not.toHaveBeenCalled();
  });

  it("lets cashiers reach list, detail, quantities, and create", async () => {
    const controller = stubController();
    const app = appWithStubs(controller);

    const responses = await Promise.all([
      request(app).get("/"),
      request(app).get("/55"),
      request(app).get("/order/10/quantities"),
      request(app).post("/").send(validBody),
    ]);

    expect(responses.every(({ status }) => status !== 403)).toBe(true);
    expect(controller.list).toHaveBeenCalledTimes(1);
    expect(controller.get).toHaveBeenCalledTimes(1);
    expect(controller.quantities).toHaveBeenCalledTimes(1);
    expect(controller.create).toHaveBeenCalledTimes(1);
  });
});

describe("refund controller wiring", () => {
  it("returns 201 on create with the parsed input and cashier id", async () => {
    const service = {
      create: vi.fn(async () => ({ id: 55 })),
    } as unknown as RefundsService;

    const response = await request(
      appWithStubs(new RealRefundsController(service)),
    )
      .post("/")
      .send(validBody);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: 55 });
    expect(service.create).toHaveBeenCalledWith(validBody, 9);
  });

  it("maps duplicate lines to 400, bad ids to 400, and missing rows to 404", async () => {
    const service = {
      create: vi.fn(async () => ({ id: 55 })),
      get: vi
        .fn()
        .mockRejectedValue(new HttpError(404, "المرتجع غير موجود")),
      quantities: vi
        .fn()
        .mockRejectedValue(new HttpError(404, "الطلب الأصلي غير موجود")),
    } as unknown as RefundsService;
    const app = appWithStubs(new RealRefundsController(service));

    const duplicate = await request(app)
      .post("/")
      .send({
        ...validBody,
        lines: [
          { orderLineId: 1, quantity: 1 },
          { orderLineId: 1, quantity: 1 },
        ],
      });
    expect(duplicate.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();

    expect((await request(app).get("/abc")).status).toBe(400);
    expect((await request(app).get("/order/abc/quantities")).status).toBe(
      400,
    );

    const missing = await request(app).get("/999");
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: "المرتجع غير موجود" });

    const missingOrder = await request(app).get("/order/999/quantities");
    expect(missingOrder.status).toBe(404);
  });
});
