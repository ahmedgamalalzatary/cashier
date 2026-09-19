import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { requireRole } from "../../src/middleware/auth.js";
import { errorHandler } from "../../src/middleware/error.js";
import { ProductsController } from "../../src/modules/products/products.controller.js";
import type { ProductsService } from "../../src/modules/products/products.service.js";
import type { CacheRefreshRepository } from "../../src/modules/external/cache-refresh.repository.js";
import { productsRouter } from "../../src/modules/products/products.router.js";

const product = (overrides: Record<string, unknown> = {}) => ({
  externalId: 9,
  nameAr: "لاتيه",
  nameEn: "Latte",
  ...overrides,
});

const freshStatus = {
  lastFailedAt: null,
  lastSuccessfulSyncAt: new Date("2026-08-18T10:00:00Z"),
  lastError: null,
};

function controllerWith(
  products: ReturnType<typeof product>[],
  status: typeof freshStatus = freshStatus,
) {
  const service = {
    list: vi.fn(async () => ({
      categories: [],
      products,
      lastSuccessfulSyncAt: new Date("2026-08-18T10:00:00Z"),
      stale: false,
      syncError: null,
    })),
  } as unknown as ProductsService;
  const refreshStore = {
    getStatus: vi.fn(async () => status),
    request: vi.fn(async () => undefined),
  } as unknown as CacheRefreshRepository;
  return new ProductsController(service, refreshStore);
}

function appWith(controller: ProductsController, role = "cashier") {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: 9, name: "Cashier", role };
    next();
  });
  app.use(express.json(), productsRouter(controller, requireRole("admin")));
  app.use(errorHandler);
  return app;
}

describe("products catalog listing", () => {
  it("filters by bilingual search and paginates", async () => {
    const app = appWith(
      controllerWith([product(), product({ externalId: 10, nameAr: "شاي", nameEn: "Tea" })]),
    );

    const search = await request(app).get("/?search=lat");
    expect(search.body.pagination.totalCount).toBe(1);
    expect(search.body.products).toHaveLength(1);

    const page = await request(app).get("/?page=2&pageSize=1&all=false");
    expect(page.body.products).toEqual([
      expect.objectContaining({ externalId: 10 }),
    ]);
    expect(page.body.pagination).toMatchObject({
      currentPage: 2,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    });

    const all = await request(app).get("/?all=true");
    expect(all.body.products).toHaveLength(2);
    expect(all.body.pagination.totalPages).toBe(1);
  });

  it("marks the catalog stale after a failed sync", async () => {
    const app = appWith(
      controllerWith(
        [product()],
        {
          lastFailedAt: new Date("2026-08-19T10:00:00Z"),
          lastSuccessfulSyncAt: new Date("2026-08-18T10:00:00Z"),
          lastError: "boom",
        },
      ),
    );

    const response = await request(app).get("/");
    expect(response.body.stale).toBe(true);
    expect(response.body.syncError).toBe("boom");
  });
});

describe("products route authorization", () => {
  it("blocks cashiers from refresh and stock setup", async () => {
    const done = (_req: unknown, res: { json: (body: unknown) => void }) =>
      res.json({ ok: true });
    const controller = {
      list: vi.fn(done),
      refresh: vi.fn(done),
      refreshStatus: vi.fn(done),
      configureStock: vi.fn(done),
    } as unknown as ProductsController;
    const app = appWith(controller);

    const responses = await Promise.all([
      request(app).post("/refresh"),
      request(app).put("/9/stock-setup").send({}),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([403, 403]);
    expect(controller.refresh).not.toHaveBeenCalled();
    expect(controller.configureStock).not.toHaveBeenCalled();

    expect((await request(app).get("/")).status).toBe(200);
    expect((await request(app).get("/refresh-status")).status).toBe(200);
  });
});
