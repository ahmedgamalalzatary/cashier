import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { OrdersController } from "../../../../src/modules/orders/orders.controller.js";
import { ordersRouter } from "../../../../src/modules/orders/orders.router.js";

describe("orders routes", () => {
  it("routes the external list before the numeric order detail route", async () => {
    const controller = {
      catalog: vi.fn((_req, res) => res.status(200).json([])),
      list: vi.fn((_req, res) => res.status(200).json([])),
      externalList: vi.fn((_req, res) => res.status(200).json([{ id: 7 }])),
      create: vi.fn((_req, res) => res.status(201).end()),
      get: vi.fn((_req, res) => res.status(200).json({ id: 1 })),
    } as unknown as OrdersController;
    const app = express();
    app.use(express.json(), ordersRouter(controller));

    const response = await request(app).get("/external");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ id: 7 }]);
    expect(controller.externalList).toHaveBeenCalledOnce();
    expect(controller.get).not.toHaveBeenCalled();
  });
});
