import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler, HttpError } from "../../src/middleware/error.js";
import type { ItemsController } from "../../src/modules/items/items.controller.js";
import { ItemsController as RealItemsController } from "../../src/modules/items/items.controller.js";
import type { ItemsService } from "../../src/modules/items/items.service.js";
import { itemsRouter } from "../../src/modules/items/items.router.js";

describe("items route authorization", () => {
  it("applies the supplied admin guard to every currently admin-only route", async () => {
    const controller = {
      list: vi.fn((_req, res) => res.status(200).end()),
      create: vi.fn((_req, res) => res.status(201).end()),
      update: vi.fn((_req, res) => res.status(200).end()),
      deactivate: vi.fn((_req, res) => res.status(200).end()),
    } as unknown as ItemsController;
    const requireAdmin: RequestHandler = (_req, res) => {
      res.status(403).end();
    };
    const app = express();
    app.use(express.json(), itemsRouter(controller, requireAdmin));

    const responses = await Promise.all([
      request(app).get("/"),
      request(app).post("/").send({}),
      request(app).put("/1").send({}),
      request(app).delete("/1"),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([403, 403, 403, 403]);
    expect(controller.list).not.toHaveBeenCalled();
    expect(controller.create).not.toHaveBeenCalled();
    expect(controller.update).not.toHaveBeenCalled();
    expect(controller.deactivate).not.toHaveBeenCalled();
  });
});

describe("items controller wiring", () => {
  const pass: RequestHandler = (_req, _res, next) => next();
  const validBody = {
    name: "بن",
    categoryId: 3,
    type: "raw",
    stockUnit: "كجم",
    mainMinimumLevel: 0,
    cafeMinimumLevel: 0,
  };

  function appWithService(service: ItemsService) {
    const app = express();
    app.use(express.json(), itemsRouter(new RealItemsController(service), pass));
    app.use(errorHandler);
    return app;
  }

  it("creates with the parsed body and updates with id plus changes", async () => {
    const service = {
      create: vi.fn(async () => 9),
      update: vi.fn(async () => undefined),
      deactivate: vi.fn(async () => undefined),
    } as unknown as ItemsService;
    const app = appWithService(service);

    const created = await request(app).post("/").send(validBody);
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: 9 });
    expect(service.create).toHaveBeenCalledWith(validBody);

    const updated = await request(app).put("/9").send({ name: "جديد" });
    expect(updated.status).toBe(200);
    expect(service.update).toHaveBeenCalledWith(9, { name: "جديد" });

    const deactivated = await request(app).delete("/9");
    expect(deactivated.status).toBe(200);
    expect(service.deactivate).toHaveBeenCalledWith(9);
  });

  it("maps bad bodies and ids to 400 and missing items to 404", async () => {
    const service = {
      create: vi.fn(async () => 9),
      deactivate: vi
        .fn()
        .mockRejectedValue(new HttpError(404, "الصنف غير موجود")),
    } as unknown as ItemsService;
    const app = appWithService(service);

    expect((await request(app).post("/").send({})).status).toBe(400);
    expect((await request(app).put("/abc").send({ name: "x" })).status).toBe(
      400,
    );

    const missing = await request(app).delete("/999");
    expect(missing.status).toBe(404);
  });
});
