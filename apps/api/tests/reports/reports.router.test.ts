import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../src/middleware/error.js";
import type { ReportsController } from "../../src/modules/reports/reports.controller.js";
import { ReportsController as RealReportsController } from "../../src/modules/reports/reports.controller.js";
import type { ReportsService } from "../../src/modules/reports/reports.service.js";
import { reportsRouter } from "../../src/modules/reports/reports.router.js";

describe("reports route authorization", () => {
  it("leaves role enforcement to the mount (adminOnly in app.ts)", async () => {
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

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect(controller.dashboard).toHaveBeenCalled();
    expect(controller.report).toHaveBeenCalled();
  });
});

describe("reports controller wiring", () => {
  function appWithService(service: ReportsService) {
    const app = express();
    app.use(express.json(), reportsRouter(new RealReportsController(service)));
    app.use(errorHandler);
    return app;
  }

  it("serves the dashboard and parses the report range", async () => {
    const service = {
      dashboard: vi.fn(async () => ({ summary: null })),
      report: vi.fn(async () => ({ range: null })),
    } as unknown as ReportsService;
    const app = appWithService(service);

    const dashboard = await request(app).get("/dashboard");
    expect(dashboard.status).toBe(200);
    expect(service.dashboard).toHaveBeenCalledTimes(1);

    const report = await request(app).get("/?from=2026-09-01&to=2026-09-30");
    expect(report.status).toBe(200);
    expect(service.report).toHaveBeenCalledWith({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("maps reversed and impossible ranges to 400", async () => {
    const service = {
      report: vi.fn(async () => ({})),
    } as unknown as ReportsService;
    const app = appWithService(service);

    expect(
      (await request(app).get("/?from=2026-09-30&to=2026-09-01")).status,
    ).toBe(400);
    expect(
      (await request(app).get("/?from=2026-02-30&to=2026-03-01")).status,
    ).toBe(400);
    expect(service.report).not.toHaveBeenCalled();
  });
});
