import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { requireRole } from "../../src/middleware/auth.js";
import { errorHandler } from "../../src/middleware/error.js";
import { HttpError } from "../../src/middleware/error.js";
import type { TransfersController } from "../../src/modules/transfers/transfers.controller.js";
import { TransfersController as RealTransfersController } from "../../src/modules/transfers/transfers.controller.js";
import type { TransfersService } from "../../src/modules/transfers/transfers.service.js";
import { transfersRouter } from "../../src/modules/transfers/transfers.router.js";

const cashierUser = { id: 9, name: "Cashier", role: "cashier" } as const;
const adminUser = { id: 7, name: "Admin", role: "admin" } as const;

function appWithStubs(
  controller: TransfersController,
  user: typeof cashierUser | typeof adminUser = cashierUser,
) {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { ...user };
    next();
  });
  app.use(
    express.json(),
    transfersRouter(controller, requireRole("admin")),
  );
  app.use(errorHandler);
  return app;
}

describe("transfer route authorization", () => {
  it("blocks cashiers from approve, reject, and direct routes", async () => {
    const noop = (_req: unknown, res: { status: (code: number) => { end: () => void } }) => res.status(200).end();
    const controller = {
      listRequests: vi.fn(noop),
      createRequest: vi.fn(noop),
      getRequest: vi.fn(noop),
      approveRequest: vi.fn((_req, res) => res.status(201).end()),
      rejectRequest: vi.fn((_req, res) => res.status(200).end()),
      listTransfers: vi.fn(noop),
      getTransfer: vi.fn(noop),
      createDirect: vi.fn((_req, res) => res.status(201).end()),
    } as unknown as TransfersController;

    const responses = await Promise.all([
      request(appWithStubs(controller))
        .post("/requests/1/approve")
        .send({ lines: [{ itemId: 5, quantity: 1 }] }),
      request(appWithStubs(controller))
        .post("/requests/1/reject")
        .send({ reason: "x" }),
      request(appWithStubs(controller))
        .post("/direct")
        .send({ lines: [{ itemId: 5, quantity: 1 }] }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([403, 403, 403]);
    expect(controller.approveRequest).not.toHaveBeenCalled();
    expect(controller.rejectRequest).not.toHaveBeenCalled();
    expect(controller.createDirect).not.toHaveBeenCalled();
  });

  it("lets cashiers reach the request list, detail, and creation routes", async () => {
    const ok = (_req: unknown, res: { status: (code: number) => { end: () => void } }) => res.status(200).end();
    const controller = {
      listRequests: vi.fn(ok),
      getRequest: vi.fn(ok),
      createRequest: vi.fn((_req, res) => res.status(201).end()),
      approveRequest: vi.fn(ok),
      rejectRequest: vi.fn(ok),
      listTransfers: vi.fn(ok),
      getTransfer: vi.fn(ok),
      createDirect: vi.fn(ok),
    } as unknown as TransfersController;

    const responses = await Promise.all([
      request(appWithStubs(controller)).get("/requests"),
      request(appWithStubs(controller)).get("/requests/1"),
      request(appWithStubs(controller))
        .post("/requests")
        .send({ clientRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
      request(appWithStubs(controller)).get("/"),
      request(appWithStubs(controller)).get("/7"),
    ]);

    expect(responses.every(({ status }) => status !== 403)).toBe(true);
    expect(controller.listRequests).toHaveBeenCalledTimes(1);
    expect(controller.getRequest).toHaveBeenCalledTimes(1);
    expect(controller.createRequest).toHaveBeenCalledTimes(1);
    expect(controller.listTransfers).toHaveBeenCalledTimes(1);
    expect(controller.getTransfer).toHaveBeenCalledTimes(1);
  });
});

describe("transfer controller wiring", () => {
  const validBody = {
    clientRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    notes: null,
    lines: [{ itemId: 5, quantity: 1 }],
  };

  function appWithService(service: TransfersService) {
    return appWithStubs(new RealTransfersController(service));
  }

  it("returns 201 with parsed bodies on create, approve, and direct", async () => {
    const service = {
      createRequest: vi.fn(async () => 11),
      approveRequest: vi.fn(async () => 22),
      createDirect: vi.fn(async () => 33),
    } as unknown as TransfersService;

    const created = await request(appWithService(service))
      .post("/requests")
      .send(validBody);
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: 11 });
    expect(service.createRequest).toHaveBeenCalledWith(
      validBody,
      expect.objectContaining({ id: 9 }),
    );

    const adminApp = appWithStubs(
      new RealTransfersController(service),
      adminUser,
    );
    const approved = await request(adminApp)
      .post("/requests/1/approve")
      .send({ lines: [{ itemId: 5, quantity: 2 }] });
    expect(approved.status).toBe(201);
    expect(approved.body).toEqual({ transferId: 22 });
    expect(service.approveRequest).toHaveBeenCalledWith(
      1,
      { lines: [{ itemId: 5, quantity: 2 }] },
      7,
    );

    const direct = await request(adminApp)
      .post("/direct")
      .send({ notes: null, lines: [{ itemId: 5, quantity: 2 }] });
    expect(direct.status).toBe(201);
    expect(direct.body).toEqual({ transferId: 33 });
  });

  it("maps duplicate lines to 400 and unknown ids to 404", async () => {
    const service = {
      createRequest: vi.fn(async () => 11),
      getRequest: vi
        .fn()
        .mockRejectedValue(new HttpError(404, "طلب التحويل غير موجود")),
    } as unknown as TransfersService;
    const app = appWithService(service);

    const duplicate = await request(app)
      .post("/requests")
      .send({
        ...validBody,
        lines: [
          { itemId: 5, quantity: 1 },
          { itemId: 5, quantity: 1 },
        ],
      });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body).toHaveProperty("error");
    expect(service.createRequest).not.toHaveBeenCalled();

    const badId = await request(app).get("/requests/abc");
    expect(badId.status).toBe(400);

    const missing = await request(app).get("/requests/999");
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: "طلب التحويل غير موجود" });
  });
});
