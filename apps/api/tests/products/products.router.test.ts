import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { productsRouter } from "../../src/modules/products/products.router.js";

describe("productsRouter", () => {
  it("returns accepted immediately for manual refresh", async () => {
    const refreshWork = new Promise(() => undefined);
    const refresh = vi.fn(async (_req, res) => {
      res.status(202).json({ accepted: true });
      await refreshWork;
    });
    const adminOnly = vi.fn((_req, _res, next) => next());
    const router = productsRouter(
      {
        list: vi.fn(),
        refresh,
        refreshStatus: vi.fn(),
        configureStock: vi.fn(),
      },
      adminOnly,
    );
    const layer = router.stack.find(
      (entry) => entry.route?.path === "/refresh",
    );
    expect(layer).toBeDefined();

    const app = express();
    app.use(router);
    const response = await request(app).post("/refresh");
    expect(response.status).toBe(202);
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("exposes catalog, manual refresh, and stock setup routes", async () => {
    const controller = {
      list: vi.fn((_req, res) => res.json({ products: [] })),
      refresh: vi.fn((_req, res) => res.json({ products: [] })),
      refreshStatus: vi.fn((_req, res) => res.json({ refreshing: false })),
      configureStock: vi.fn((_req, res) => res.json({ ok: true })),
    };
    const adminOnly = vi.fn((_req, _res, next) => next());
    const app = express();
    app.use(express.json());
    app.use(productsRouter(controller, adminOnly));

    expect((await request(app).get("/")).status).toBe(200);
    expect((await request(app).post("/refresh")).status).toBe(200);
    expect((await request(app).get("/refresh-status")).status).toBe(200);
    expect(
      (
        await request(app)
          .put("/9/stock-setup")
          .send({ baseIngredients: [], sizes: [], modifiers: [] })
      ).status,
    ).toBe(200);
    expect(adminOnly).toHaveBeenCalledTimes(2);
    expect(controller.configureStock).toHaveBeenCalledOnce();
  });
});
