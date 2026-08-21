import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { productsRouter } from "../../../../src/modules/products/products.router.js";

describe("productsRouter", () => {
  it("exposes catalog, manual refresh, and stock setup routes", async () => {
    const controller = {
      list: vi.fn((_req, res) => res.json({ products: [] })),
      refresh: vi.fn((_req, res) => res.json({ products: [] })),
      configureStock: vi.fn((_req, res) => res.json({ ok: true })),
    };
    const adminOnly = vi.fn((_req, _res, next) => next());
    const app = express();
    app.use(express.json());
    app.use(productsRouter(controller, adminOnly));

    expect((await request(app).get("/")).status).toBe(200);
    expect((await request(app).post("/refresh")).status).toBe(200);
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
