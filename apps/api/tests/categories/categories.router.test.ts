import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler, HttpError } from "../../src/middleware/error.js";
import type { CategoriesController } from "../../src/modules/categories/categories.controller.js";
import { CategoriesController as RealCategoriesController } from "../../src/modules/categories/categories.controller.js";
import type { CategoriesService } from "../../src/modules/categories/categories.service.js";
import { categoriesRouter } from "../../src/modules/categories/categories.router.js";

function appWithStubs(controller: CategoriesController) {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: 7, name: "Admin", role: "admin" };
    next();
  });
  app.use(express.json(), categoriesRouter(controller));
  app.use(errorHandler);
  return app;
}

describe("category routes", () => {
  it("dispatches list, create, update, and deactivate", async () => {
    const controller = {
      list: vi.fn((_req, res) => res.json([])),
      create: vi.fn((_req, res) => res.status(201).json({ id: 9 })),
      update: vi.fn((_req, res) => res.json({ ok: true })),
      deactivate: vi.fn((_req, res) => res.json({ ok: true })),
    } as unknown as CategoriesController;
    const app = appWithStubs(controller);

    const [list, created, updated, deactivated] = await Promise.all([
      request(app).get("/"),
      request(app).post("/").send({ name: "خامات" }),
      request(app).put("/9").send({ name: "جديد" }),
      request(app).delete("/9"),
    ]);

    expect([list.status, created.status, updated.status, deactivated.status]).toEqual([
      200, 201, 200, 200,
    ]);
    expect(controller.list).toHaveBeenCalledTimes(1);
    expect(controller.create).toHaveBeenCalledTimes(1);
    expect(controller.update).toHaveBeenCalledTimes(1);
    expect(controller.deactivate).toHaveBeenCalledTimes(1);
  });
});

describe("category controller wiring", () => {
  it("creates with the parsed body and updates with id plus changes", async () => {
    const service = {
      create: vi.fn(async () => 9),
      update: vi.fn(async () => undefined),
    } as unknown as CategoriesService;
    const app = appWithStubs(new RealCategoriesController(service));

    const created = await request(app).post("/").send({ name: "خامات" });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: 9 });
    expect(service.create).toHaveBeenCalledWith({ name: "خامات" });

    const updated = await request(app).put("/9").send({ name: "جديد" });
    expect(updated.status).toBe(200);
    expect(service.update).toHaveBeenCalledWith(9, { name: "جديد" });
  });

  it("maps blank names, empty updates, and bad ids to 400", async () => {
    const service = {
      deactivate: vi
        .fn()
        .mockRejectedValue(new HttpError(404, "التصنيف غير موجود")),
    } as unknown as CategoriesService;
    const app = appWithStubs(new RealCategoriesController(service));

    expect((await request(app).post("/").send({ name: "   " })).status).toBe(
      400,
    );
    expect((await request(app).put("/9").send({})).status).toBe(400);
    expect((await request(app).put("/abc").send({ name: "x" })).status).toBe(
      400,
    );

    const missing = await request(app).delete("/999");
    expect(missing.status).toBe(404);
  });
});
