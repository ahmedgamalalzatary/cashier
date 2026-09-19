import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { requireRole } from "../../src/middleware/auth.js";
import { errorHandler } from "../../src/middleware/error.js";
import type { InventoryController } from "../../src/modules/inventory/inventory.controller.js";
import { InventoryController as RealInventoryController } from "../../src/modules/inventory/inventory.controller.js";
import type { InventoryService } from "../../src/modules/inventory/inventory.service.js";
import { inventoryRouter } from "../../src/modules/inventory/inventory.router.js";

function appWithStubs(controller: InventoryController, role = "cashier") {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: 9, name: "Cashier", role };
    next();
  });
  app.use(express.json(), inventoryRouter(controller, requireRole("admin")));
  app.use(errorHandler);
  return app;
}

describe("inventory route authorization", () => {
  it("blocks cashiers from main-warehouse stock but allows cafe stock", async () => {
    const controller = {
      stock: () => (_req: unknown, res: { json: (body: unknown) => void }) =>
        res.json([]),
    } as unknown as InventoryController;
    const app = appWithStubs(controller);

    const main = await request(app).get("/main/stock");
    expect(main.status).toBe(403);

    const cafe = await request(app).get("/cafe/stock");
    expect(cafe.status).toBe(200);
  });
});

describe("inventory controller wiring", () => {
  it("lists stock per warehouse through the service", async () => {
    const service = {
      listStock: vi.fn(async () => [{ itemId: 1 }]),
    } as unknown as InventoryService;
    const app = appWithStubs(new RealInventoryController(service));

    const cafe = await request(app).get("/cafe/stock");
    expect(cafe.status).toBe(200);
    expect(cafe.body).toEqual([{ itemId: 1 }]);
    expect(service.listStock).toHaveBeenCalledWith("cafe");
  });
});
