import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler, HttpError } from "../../src/middleware/error.js";
import type { OrdersController } from "../../src/modules/orders/orders.controller.js";
import { OrdersController as RealOrdersController } from "../../src/modules/orders/orders.controller.js";
import type { OrdersService } from "../../src/modules/orders/orders.service.js";
import type { ExternalOrdersRepository } from "../../src/modules/orders/external-orders.repository.js";
import { ordersRouter } from "../../src/modules/orders/orders.router.js";

describe("orders routes", () => {
  it("routes the external list before the numeric order detail route", async () => {
    const controller = {
      catalog: vi.fn((_req, res) => res.status(200).json([])),
      list: vi.fn((_req, res) => res.status(200).json([])),
      externalList: vi.fn((_req, res) => res.status(200).json([{ id: 7 }])),
      create: vi.fn((_req, res) => res.status(201).end()),
      get: vi.fn((_req, res) => res.status(200).json({ id: 1 })),
    } as unknown as OrdersController;
    const app = express();
    app.use(express.json(), ordersRouter(controller));

    const response = await request(app).get("/external");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ id: 7 }]);
    expect(controller.externalList).toHaveBeenCalledOnce();
    expect(controller.get).not.toHaveBeenCalled();
  });
});

function appWithStubs(controller: OrdersController, role = "cashier") {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: 7, name: "Cashier", role };
    next();
  });
  app.use(express.json(), ordersRouter(controller));
  app.use(errorHandler);
  return app;
}

const validBody = {
  clientRequestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  lines: [
    {
      type: "external_product",
      externalProductId: 1,
      externalSizeId: null,
      quantity: 1,
      modifiers: [],
    },
  ],
  discount: null,
  cashReceived: 20,
};

describe("order route authorization", () => {
  it("blocks non-cashiers from creating orders", async () => {
    const done = (_req: unknown, res: { json: (body: unknown) => void }) =>
      res.json({ ok: true });
    const controller = {
      externalList: vi.fn(done),
      list: vi.fn(done),
      create: vi.fn((_req, res) => res.status(201).end()),
      get: vi.fn(done),
    } as unknown as OrdersController;

    const response = await request(appWithStubs(controller, "admin"))
      .post("/")
      .send(validBody);

    expect(response.status).toBe(403);
    expect(controller.create).not.toHaveBeenCalled();
  });
});

describe("order controller wiring", () => {
  it("creates with the parsed input and cashier id for 201", async () => {
    const service = {
      create: vi.fn(async () => ({ id: 5 })),
    } as unknown as OrdersService;
    const externalOrders = {} as ExternalOrdersRepository;
    const app = appWithStubs(
      new RealOrdersController(service, externalOrders),
    );

    const response = await request(app).post("/").send(validBody);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: 5 });
    expect(service.create).toHaveBeenCalledWith(validBody, 7);
  });

  it("paginates the external list with safe defaults", async () => {
    const externalOrders = {
      list: vi.fn(async () => []),
    } as unknown as ExternalOrdersRepository;
    const service = {} as OrdersService;
    const app = appWithStubs(
      new RealOrdersController(service, externalOrders),
    );

    await request(app).get("/external?page=abc&pageSize=9999");
    expect(externalOrders.list).toHaveBeenCalledWith({
      search: undefined,
      day: undefined,
      page: 1,
      pageSize: 100,
    });

    await request(app).get("/external?search=lat&page=2&pageSize=10&day=2026-07-20");
    expect(externalOrders.list).toHaveBeenCalledWith({
      search: "lat",
      day: "2026-07-20",
      page: 2,
      pageSize: 10,
    });
  });

  it("maps bad bodies and ids to 400 and missing orders to 404", async () => {
    const service = {
      create: vi.fn(async () => ({ id: 5 })),
      get: vi.fn().mockRejectedValue(new HttpError(404, "الطلب غير موجود")),
    } as unknown as OrdersService;
    const externalOrders = {} as ExternalOrdersRepository;
    const app = appWithStubs(
      new RealOrdersController(service, externalOrders),
    );

    expect((await request(app).post("/").send({})).status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
    expect((await request(app).get("/abc")).status).toBe(400);

    const missing = await request(app).get("/999");
    expect(missing.status).toBe(404);
  });
});
