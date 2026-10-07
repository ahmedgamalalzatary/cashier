import { describe, expect, it } from "vitest";
import { CacheRefreshRepository } from "../../../../apps/api/src/modules/external/cache-refresh.repository.js";
import { db } from "../support/api-setup.js";
import { sql } from "drizzle-orm";
import type { ExternalOrderSummary } from "@cashier/shared";
import { CacheRefreshService } from "../../../../apps/api/src/modules/external/cache-refresh.service.js";
import { ProductsRepository } from "../../../../apps/api/src/modules/products/products.repository.js";
import { ExternalOrdersRepository } from "../../../../apps/api/src/modules/orders/external-orders.repository.js";

describe("durable cache refresh state", () => {
  it("persists online orders without restoring an archived external catalog when catalog sync is disabled", async () => {
    const store = new CacheRefreshRepository(db);
    const products = new ProductsRepository(db, false);
    const orders = new ExternalOrdersRepository(db);
    const row: ExternalOrderSummary = {
      id: 71,
      customerName: "Online customer",
      customerPhone: "01000000000",
      subtotal: "50.00",
      discountAmount: "0.00",
      totalAmount: "50.00",
      deliveryFee: "0.00",
      createdAt: "2026-09-28T10:00:00",
      orderStatus: "pending",
      paymentStatus: "unpaid",
      paymentMethod: "cash_on_delivery",
      orderType: "delivery",
      itemCount: 1,
    };
    const service = new CacheRefreshService(
      store,
      {
        load: async () => {
          throw new Error("Archived upstream catalog must stay disabled");
        },
      },
      products,
      { listAll: async () => [row] },
      orders,
      {
        now: () => new Date("2026-09-28T12:00:00Z"),
        owner: "orders-only-test",
        syncCatalog: false,
      },
    );
    await expect(service.runForced()).resolves.toBe(true);
    expect((await orders.list({ page: 1, pageSize: 10 })).data).toContainEqual(
      expect.objectContaining({ id: 71, totalAmount: "50.00" }),
    );
    const [cached] = await db.execute(
      sql`SELECT COUNT(*) AS count FROM external_products`,
    );
    expect(Number(cached[0].count)).toBe(0);
    expect(await store.getStatus()).toMatchObject({
      lastError: null,
      refreshing: false,
    });
  });
  it("allows only one owner and persists request, attempt, failure, and success state", async () => {
    const first = new CacheRefreshRepository(db);
    const second = new CacheRefreshRepository(db);
    const now = new Date("2026-08-21T12:00:00Z");

    await first.request(now);
    expect(
      await first.tryAcquire("worker-1", now, new Date("2026-08-21T12:15:00Z")),
    ).toBe(true);
    expect(
      await second.tryAcquire(
        "worker-2",
        now,
        new Date("2026-08-21T12:15:00Z"),
      ),
    ).toBe(false);
    await expect(
      first.renew("worker-1", now, new Date("2026-08-21T12:15:00Z")),
    ).resolves.toBe(true);

    await first.markAttempt(now);
    await first.markFailure(now, "offline");
    await first.release("worker-1");
    await second.markSuccess(new Date("2026-08-21T12:01:00Z"), 1);

    await expect(second.getStatus()).resolves.toMatchObject({
      lastAttemptAt: now,
      lastFailedAt: now,
      lastError: null,
      refreshRequestedAt: null,
      refreshing: false,
    });
  });

  it("preserves a hard-refresh request created after the active run started", async () => {
    const repository = new CacheRefreshRepository(db);
    const runStartedAt = new Date("2026-08-21T12:00:00Z");
    expect(
      await repository.tryAcquire(
        "worker-1",
        runStartedAt,
        new Date("2026-08-21T12:15:00Z"),
      ),
    ).toBe(true);
    await repository.markAttempt(runStartedAt);

    const requestedAt = new Date("2026-08-21T12:01:00Z");
    await repository.request(requestedAt);
    await expect(repository.getStatus()).resolves.toMatchObject({
      refreshRequestedAt: requestedAt,
    });

    await repository.markSuccess(new Date("2026-08-21T12:02:00Z"), 0);

    await expect(repository.getStatus()).resolves.toMatchObject({
      refreshRequestedAt: requestedAt,
    });
  });
});
