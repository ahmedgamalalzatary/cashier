import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler, HttpError } from "../../src/middleware/error.js";
import type { PurchasesController } from "../../src/modules/purchases/purchases.controller.js";
import { PurchasesController as RealPurchasesController } from "../../src/modules/purchases/purchases.controller.js";
import type { PurchasesService } from "../../src/modules/purchases/purchases.service.js";
import { purchasesRouter } from "../../src/modules/purchases/purchases.router.js";

function appWithStubs(controller: PurchasesController) {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: 7, name: "Admin", role: "admin" };
    next();
  });
  app.use(express.json(), purchasesRouter(controller));
  app.use(errorHandler);
  return app;
}

const validBody = {
  clientRequestId: "11111111-1111-4111-8111-111111111111",
  supplierId: 1,
  invoiceNumber: "INV-1",
  purchasedAt: "2026-07-20",
  paidAmount: 0,
  notes: null,
  lines: [{ itemId: 5, quantity: 1, unitMode: "stock", unitPrice: 10 }],
};

describe("purchase routes", () => {
  it("dispatches list, detail, and create to the controller", async () => {
    const controller = {
      list: vi.fn((_req, res) => res.json([])),
      get: vi.fn((_req, res) => res.json({ id: 1 })),
      create: vi.fn((_req, res) => res.status(201).json({ id: 44 })),
    } as unknown as PurchasesController;
    const app = appWithStubs(controller);

    const [list, detail, created] = await Promise.all([
      request(app).get("/"),
      request(app).get("/44"),
      request(app).post("/").send(validBody),
    ]);

    expect(list.status).toBe(200);
    expect(detail.status).toBe(200);
    expect(created.status).toBe(201);
    expect(controller.list).toHaveBeenCalledTimes(1);
    expect(controller.get).toHaveBeenCalledTimes(1);
    expect(controller.create).toHaveBeenCalledTimes(1);
  });
});

describe("purchase controller wiring", () => {
  it("returns 201 with the parsed input and actor id", async () => {
    const service = {
      create: vi.fn(async () => 44),
    } as unknown as PurchasesService;

    const response = await request(
      appWithStubs(new RealPurchasesController(service)),
    )
      .post("/")
      .send(validBody);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: 44 });
    expect(service.create).toHaveBeenCalledWith(validBody, 7);
  });

  it("maps duplicate lines to 400, bad ids to 400, and missing invoices to 404", async () => {
    const service = {
      create: vi.fn(async () => 44),
      get: vi
        .fn()
        .mockRejectedValue(new HttpError(404, "فاتورة الشراء غير موجودة")),
    } as unknown as PurchasesService;
    const app = appWithStubs(new RealPurchasesController(service));

    const duplicate = await request(app)
      .post("/")
      .send({
        ...validBody,
        lines: [
          { itemId: 5, quantity: 1, unitMode: "stock", unitPrice: 10 },
          { itemId: 5, quantity: 1, unitMode: "stock", unitPrice: 10 },
        ],
      });
    expect(duplicate.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();

    const badId = await request(app).get("/abc");
    expect(badId.status).toBe(400);

    const missing = await request(app).get("/999");
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: "فاتورة الشراء غير موجودة" });
  });
});
