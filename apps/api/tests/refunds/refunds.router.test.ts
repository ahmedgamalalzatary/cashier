import { testId } from "@cashier/shared/test-support";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler, HttpError } from "@cashier/server-core";
import type { RefundsController } from "../../src/modules/refunds/refunds.controller.js";
import { RefundsController as RealRefundsController } from "../../src/modules/refunds/refunds.controller.js";
import type { RefundsService } from "../../src/modules/refunds/refunds.service.js";
import { refundsRouter } from "../../src/modules/refunds/refunds.router.js";

function appWithStubs(controller: RefundsController, role = "cashier") {
  const app = express();
  app.use((req, _res, next) => {
    req.user = {
      id: testId(9),
      name: "Cashier",
      role: role as "admin" | "cashier",
      branchId: role === "cashier" ? 1 : null,
      isSuperAdmin: false,
    };
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
  orderId: testId(10),
  reason: "طلب العميل",
  lines: [{ orderLineId: testId(1), quantity: 2, stockAction: null }],
};

describe("refund route authorization", () => {
  it("lets an admin create a refund through the same route", async () => {
    const controller = stubController();

    const response = await request(appWithStubs(controller, "admin"))
      .post("/")
      .send(validBody);

    expect(response.status).toBe(201);
    expect(controller.create).toHaveBeenCalledOnce();
  });

  it("lets cashiers reach list, detail, quantities, and create", async () => {
    const controller = stubController();
    const app = appWithStubs(controller);

    const responses = await Promise.all([
      request(app).get("/"),
      request(app).get("/00000000-0000-7000-8000-000000000037"),
      request(app).get("/order/00000000-0000-7000-8000-00000000000a/quantities"),
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
      create: vi.fn(async () => ({ id: testId(55) })),
    } as unknown as RefundsService;

    const response = await request(
      appWithStubs(new RealRefundsController(service)),
    )
      .post("/")
      .send(validBody);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: testId(55) });
    expect(service.create).toHaveBeenCalledWith(
      validBody,
      expect.objectContaining({ id: testId(9), role: "cashier" }),
    );
  });

  it("maps duplicate lines to 400, bad ids to 400, and missing rows to 404", async () => {
    const service = {
      create: vi.fn(async () => ({ id: testId(55) })),
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
          { orderLineId: testId(1), quantity: 1 },
          { orderLineId: testId(1), quantity: 1 },
        ],
      });
    expect(duplicate.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();

    expect((await request(app).get("/abc")).status).toBe(400);
    expect((await request(app).get("/order/abc/quantities")).status).toBe(
      400,
    );

    const missing = await request(app).get("/00000000-0000-7000-8000-0000000003e7");
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: "المرتجع غير موجود" });

    const missingOrder = await request(app).get("/order/00000000-0000-7000-8000-0000000003e7/quantities");
    expect(missingOrder.status).toBe(404);
  });
});
