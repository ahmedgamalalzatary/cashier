import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { ReportsController } from "../../../../src/modules/reports/reports.controller.js";
import { reportsRouter } from "../../../../src/modules/reports/reports.router.js";

describe("reports route authorization", () => {
  it("blocks cashiers from every reports endpoint", async () => {
    const controller = {
      dashboard: vi.fn((_req, res) => res.status(200).end()),
      report: vi.fn((_req, res) => res.status(200).end()),
    } as unknown as ReportsController;
    const app = express();
    app.use((req, _res, next) => {
      req.user = { id: 1, name: "Cashier", role: "cashier" };
      next();
    });
    app.use(reportsRouter(controller));

    const responses = await Promise.all([
      request(app).get("/dashboard"),
      request(app).get("/?from=2026-09-01&to=2026-09-30"),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([403, 403]);
    expect(controller.dashboard).not.toHaveBeenCalled();
    expect(controller.report).not.toHaveBeenCalled();
  });
});
