import { testId } from "@cashier/shared/test-support";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler, HttpError } from "@cashier/server-core";
import type { RecipesController } from "../../src/modules/recipes/recipes.controller.js";
import { RecipesController as RealRecipesController } from "../../src/modules/recipes/recipes.controller.js";
import type { RecipesService } from "../../src/modules/recipes/recipes.service.js";
import { recipesRouter } from "../../src/modules/recipes/recipes.router.js";

function appWithStubs(controller: RecipesController) {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: testId(9), name: "Cashier", role: "cashier" };
    next();
  });
  app.use(express.json(), recipesRouter(controller));
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
    reactivate: vi.fn(ok),
    prepare: vi.fn(created),
    listPreparations: vi.fn(ok),
    getPreparation: vi.fn(ok),
  } as unknown as RecipesController;
}

const validRecipe = {
  name: "كابتشينو",
  categoryId: testId(2),
  type: "prepared",
  outputItemId: testId(5),
  baseYield: 10,
  ingredients: [{ itemId: testId(1), quantity: 0.5 }],
};

describe("recipe routes", () => {
  it("dispatches all nine recipe routes to the controller", async () => {
    const controller = stubController();
    const app = appWithStubs(controller);

    const responses = await Promise.all([
      request(app).get("/"),
      request(app).post("/").send(validRecipe),
      request(app).get("/00000000-0000-7000-8000-000000000003"),
      request(app).put("/00000000-0000-7000-8000-000000000003").send(validRecipe),
      request(app).delete("/00000000-0000-7000-8000-000000000003"),
      request(app).put("/00000000-0000-7000-8000-000000000003/active"),
      request(app).post("/00000000-0000-7000-8000-000000000003/prepare").send({ quantity: 2, notes: null }),
      request(app).get("/preparations"),
      request(app).get("/preparations/00000000-0000-7000-8000-00000000004d"),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([
      200, 201, 200, 200, 200, 200, 201, 200, 200,
    ]);
    for (const handler of [
      controller.list,
      controller.create,
      controller.get,
      controller.update,
      controller.deactivate,
      controller.reactivate,
      controller.prepare,
      controller.listPreparations,
      controller.getPreparation,
    ]) {
      expect(handler).toHaveBeenCalledTimes(1);
    }
  });
});

describe("recipe controller wiring", () => {
  it("creates and prepares with parsed bodies, user id, and 201", async () => {
    const service = {
      create: vi.fn(async () => testId(3)),
      prepare: vi.fn(async () => testId(77)),
    } as unknown as RecipesService;
    const app = appWithStubs(new RealRecipesController(service));

    const created = await request(app).post("/").send(validRecipe);
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: testId(3) });
    expect(service.create).toHaveBeenCalledWith(validRecipe);

    const prepared = await request(app)
      .post("/00000000-0000-7000-8000-000000000003/prepare")
      .send({ quantity: 2, notes: null });
    expect(prepared.status).toBe(201);
    expect(prepared.body).toEqual({ preparationId: testId(77) });
    expect(service.prepare).toHaveBeenCalledWith(
      testId(3),
      { quantity: 2, notes: null },
      testId(9),
    );
  });

  it("maps bad bodies and ids to 400 and missing recipes to 404", async () => {
    const service = {
      get: vi
        .fn()
        .mockRejectedValue(new HttpError(404, "الوصفة غير موجودة")),
    } as unknown as RecipesService;
    const app = appWithStubs(new RealRecipesController(service));

    expect(
      (await request(app).post("/").send({ ...validRecipe, type: "product" }))
        .status,
    ).toBe(400);
    expect(
      (await request(app).post("/00000000-0000-7000-8000-000000000003/prepare").send({ quantity: 0, notes: null }))
        .status,
    ).toBe(400);
    expect((await request(app).get("/abc")).status).toBe(400);

    const missing = await request(app).get("/00000000-0000-7000-8000-0000000003e7");
    expect(missing.status).toBe(404);
  });
});
