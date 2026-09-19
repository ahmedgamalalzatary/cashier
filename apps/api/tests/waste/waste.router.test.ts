import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler, HttpError } from "../../src/middleware/error.js";
import type { WasteController } from "../../src/modules/waste/waste.controller.js";
import { WasteController as RealWasteController } from "../../src/modules/waste/waste.controller.js";
import type { WasteService } from "../../src/modules/waste/waste.service.js";
import { wasteRouter } from "../../src/modules/waste/waste.router.js";

function appWithStubs(controller: WasteController) {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: 9, name: "Cashier", role: "cashier" };
    next();
  });
  app.use(express.json(), wasteRouter(controller));
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
    catalog: vi.fn(ok),
    list: vi.fn(ok),
    get: vi.fn(ok),
    create: vi.fn(created),
  } as unknown as WasteController;
}

const validBody = {
  clientRequestId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  warehouse: "cafe",
  target: { type: "item", itemId: 2 },
  quantity: 1,
  reason: "spill",
  note: null,
};

describe("waste routes", () => {
  it("dispatches catalog, list, detail, and create", async () => {
    const controller = stubController();
    const app = appWithStubs(controller);

    const responses = await Promise.all([
      request(app).get("/catalog"),
      request(app).get("/"),
      request(app).get("/8"),
      request(app).post("/").send(validBody),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([200, 200, 200, 201]);
    expect(controller.catalog).toHaveBeenCalledTimes(1);
    expect(controller.list).toHaveBeenCalledTimes(1);
    expect(controller.get).toHaveBeenCalledTimes(1);
    expect(controller.create).toHaveBeenCalledTimes(1);
  });
});

describe("waste controller wiring", () => {
  it("creates with 201 and the parsed input plus actor", async () => {
    const service = {
      create: vi.fn(async () => ({ id: 8 })),
    } as unknown as WasteService;
    const app = appWithStubs(new RealWasteController(service));

    const response = await request(app).post("/").send(validBody);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: 8 });
    expect(service.create).toHaveBeenCalledWith(
      validBody,
      expect.objectContaining({ id: 9, role: "cashier" }),
    );
  });

  it("maps bad bodies and ids to 400, and service errors through", async () => {
    const service = {
      create: vi.fn(async () => ({ id: 8 })),
      get: vi
        .fn()
        .mockRejectedValue(new HttpError(403, "لا تملك صلاحية عرض هالك المخزن الرئيسي")),
    } as unknown as WasteService;
    const app = appWithStubs(new RealWasteController(service));

    expect((await request(app).post("/").send({})).status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
    expect((await request(app).get("/abc")).status).toBe(400);

    const forbidden = await request(app).get("/8");
    expect(forbidden.status).toBe(403);
  });
});
