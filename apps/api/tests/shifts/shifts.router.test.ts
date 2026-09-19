import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../src/middleware/error.js";
import type { ShiftsController } from "../../src/modules/shifts/shifts.controller.js";
import { ShiftsController as RealShiftsController } from "../../src/modules/shifts/shifts.controller.js";
import type { ShiftsService } from "../../src/modules/shifts/shifts.service.js";
import { shiftsRouter } from "../../src/modules/shifts/shifts.router.js";

type Role = "admin" | "cashier";

function appWithStubs(controller: ShiftsController, role: Role = "cashier") {
  const app = express();
  app.use((req, _res, next) => {
    req.user = {
      id: role === "admin" ? 7 : 9,
      name: role === "admin" ? "Admin" : "Cashier",
      role,
    };
    next();
  });
  app.use(express.json(), shiftsRouter(controller));
  app.use(errorHandler);
  return app;
}

function stubController(
  overrides: Partial<Record<keyof ShiftsController, unknown>> = {},
) {
  const ok = vi.fn((_req: unknown, res: { json: (body: unknown) => void }) =>
    res.json({ ok: true }),
  );
  return {
    open: vi.fn(ok),
    current: vi.fn(ok),
    list: vi.fn(ok),
    close: vi.fn(ok),
    adminClose: vi.fn(ok),
    reopen: vi.fn(ok),
    correct: vi.fn(ok),
    ...overrides,
  } as unknown as ShiftsController;
}

describe("shift route authorization", () => {
  it("blocks admins from open/close and cashiers from admin routes", async () => {
    const controller = stubController();

    const adminResponses = await Promise.all([
      request(appWithStubs(controller, "admin")).post("/open").send({
        openingFloat: 100,
      }),
      request(appWithStubs(controller, "admin")).post("/1/close").send({
        actualCash: 100,
      }),
    ]);
    expect(adminResponses.map(({ status }) => status)).toEqual([403, 403]);

    const cashierResponses = await Promise.all([
      request(appWithStubs(controller)).post("/1/admin-close").send({
        actualCash: 100,
        note: "إغلاق",
      }),
      request(appWithStubs(controller)).post("/1/reopen").send({
        note: "فتح",
      }),
      request(appWithStubs(controller)).put("/1/correction").send({
        note: "تصحيح",
        actualCash: 100,
      }),
    ]);
    expect(cashierResponses.map(({ status }) => status)).toEqual([
      403, 403, 403,
    ]);

    for (const handler of [
      controller.open,
      controller.close,
      controller.adminClose,
      controller.reopen,
      controller.correct,
    ]) {
      expect(handler).not.toHaveBeenCalled();
    }
  });

  it("lets cashiers reach current, list, open, and close", async () => {
    const controller = stubController();

    const responses = await Promise.all([
      request(appWithStubs(controller)).get("/current"),
      request(appWithStubs(controller)).get("/"),
      request(appWithStubs(controller)).post("/open").send({
        openingFloat: 100,
      }),
      request(appWithStubs(controller)).post("/1/close").send({
        actualCash: 100,
      }),
    ]);

    expect(responses.every(({ status }) => status !== 403)).toBe(true);
    expect(controller.current).toHaveBeenCalledTimes(1);
    expect(controller.list).toHaveBeenCalledTimes(1);
    expect(controller.open).toHaveBeenCalledTimes(1);
    expect(controller.close).toHaveBeenCalledTimes(1);
  });
});

describe("shift controller wiring", () => {
  it("returns 201 on open with the parsed body and user id", async () => {
    const service = {
      open: vi.fn(async () => ({ id: 5 })),
    } as unknown as ShiftsService;
    const response = await request(
      appWithStubs(new RealShiftsController(service)),
    )
      .post("/open")
      .send({ openingFloat: 100 });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: 5 });
    expect(service.open).toHaveBeenCalledWith({ openingFloat: 100 }, 9);
  });

  it("maps bad ids and bodies to 400", async () => {
    const service = {} as ShiftsService;
    const app = appWithStubs(new RealShiftsController(service));

    const badId = await request(app).post("/abc/close").send({
      actualCash: 100,
    });
    expect(badId.status).toBe(400);

    const badBody = await request(app).post("/open").send({
      openingFloat: -5,
    });
    expect(badBody.status).toBe(400);
    expect(badBody.body).toHaveProperty("error");
  });
});
