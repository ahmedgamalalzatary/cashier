import { describe, expect, it, vi } from "vitest";
import { CacheRefreshService } from "../../../../src/modules/external/cache-refresh.service.js";

const now = new Date("2026-08-21T12:00:00.000Z");

describe("CacheRefreshService", () => {
  it("uses one durable lock and refreshes catalog plus append-only orders", async () => {
    const state = {
      getState: vi.fn().mockResolvedValue({
        lastSuccessfulSyncAt: null,
        lastFailedAt: null,
        refreshRequestedAt: now,
        refreshRequestVersion: 1,
      }),
      tryAcquire: vi.fn().mockResolvedValue(true),
      renew: vi.fn().mockResolvedValue(true),
      markAttempt: vi.fn(),
      markSuccess: vi.fn(),
      markFailure: vi.fn(),
      release: vi.fn(),
      request: vi.fn(),
    };
    const catalog = { load: vi.fn().mockResolvedValue({ products: [] }) };
    const products = { applyCatalog: vi.fn() };
    const externalOrders = {
      listAll: vi.fn().mockResolvedValue([{ id: 17 }]),
    };
    const orders = { insertUnseen: vi.fn() };
    const service = new CacheRefreshService(
      state,
      catalog,
      products,
      externalOrders,
      orders,
      { now: () => now, owner: "worker-1" },
    );

    await expect(service.runDue()).resolves.toBe(true);
    expect(state.tryAcquire).toHaveBeenCalledOnce();
    expect(products.applyCatalog).toHaveBeenCalledWith({ products: [] });
    expect(orders.insertUnseen).toHaveBeenCalledWith([{ id: 17 }]);
    expect(state.markSuccess).toHaveBeenCalledOnce();
    expect(state.release).toHaveBeenCalledOnce();
  });

  it("keeps failure cooldown separate and always releases the lock", async () => {
    const state = {
      getState: vi.fn().mockResolvedValue({
        lastSuccessfulSyncAt: new Date("2026-08-20T00:00:00Z"),
        lastFailedAt: new Date("2026-08-21T11:59:50Z"),
        refreshRequestedAt: new Date("2026-08-21T11:59:40Z"),
        refreshRequestVersion: 1,
      }),
      tryAcquire: vi.fn().mockResolvedValue(true),
      renew: vi.fn().mockResolvedValue(true),
      markAttempt: vi.fn(),
      markSuccess: vi.fn(),
      markFailure: vi.fn(),
      release: vi.fn(),
      request: vi.fn(),
    };
    const service = new CacheRefreshService(
      state,
      { load: vi.fn().mockRejectedValue(new Error("offline")) },
      { applyCatalog: vi.fn() },
      { listAll: vi.fn() },
      { insertUnseen: vi.fn() },
      { now: () => now, owner: "worker-1" },
    );

    await expect(service.runDue()).resolves.toBe(false);
    expect(state.tryAcquire).not.toHaveBeenCalled();

    await expect(service.runForced()).rejects.toThrow("offline");
    expect(state.markFailure).toHaveBeenCalledOnce();
    expect(state.release).toHaveBeenCalledOnce();
  });

  it("hard refresh only persists a request for the worker", async () => {
    const state = { request: vi.fn() };
    const service = new CacheRefreshService(
      state as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { now: () => now, owner: "api" },
    );

    await service.requestRefresh();

    expect(state.request).toHaveBeenCalledWith(now);
  });

  it("does not persist data or success after losing the lease", async () => {
    const state = {
      getState: vi.fn().mockResolvedValue({
        lastSuccessfulSyncAt: null,
        lastFailedAt: null,
        refreshRequestedAt: null,
        refreshRequestVersion: 0,
      }),
      tryAcquire: vi.fn().mockResolvedValue(true),
      renew: vi.fn().mockResolvedValue(false),
      markAttempt: vi.fn(),
      markSuccess: vi.fn(),
      markFailure: vi.fn(),
      release: vi.fn(),
      request: vi.fn(),
    };
    const products = { applyCatalog: vi.fn() };
    const orders = { insertUnseen: vi.fn() };
    const service = new CacheRefreshService(
      state,
      { load: vi.fn().mockResolvedValue({ categories: [], products: [] }) },
      products,
      { listAll: vi.fn().mockResolvedValue([]) },
      orders,
      { now: () => now, owner: "worker-1" },
    );

    await expect(service.runForced()).rejects.toThrow("refresh lease");
    expect(products.applyCatalog).not.toHaveBeenCalled();
    expect(orders.insertUnseen).not.toHaveBeenCalled();
    expect(state.markSuccess).not.toHaveBeenCalled();
  });

  it("stops at a stage boundary and releases without recording failure when aborted", async () => {
    const shutdown = new AbortController();
    const state = {
      getState: vi.fn().mockResolvedValue({
        lastSuccessfulSyncAt: null,
        lastFailedAt: null,
        refreshRequestedAt: null,
        refreshRequestVersion: 0,
      }),
      tryAcquire: vi.fn().mockResolvedValue(true),
      renew: vi.fn().mockResolvedValue(true),
      markAttempt: vi.fn(),
      markSuccess: vi.fn(),
      markFailure: vi.fn(),
      release: vi.fn(),
      request: vi.fn(),
    };
    const products = { applyCatalog: vi.fn() };
    const service = new CacheRefreshService(
      state,
      {
        load: vi.fn().mockImplementation(async () => {
          shutdown.abort();
          return { categories: [], products: [] };
        }),
      },
      products,
      { listAll: vi.fn().mockResolvedValue([]) },
      { insertUnseen: vi.fn() },
      { now: () => now, owner: "worker-1" },
    );

    await expect(service.runForced(shutdown.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(products.applyCatalog).not.toHaveBeenCalled();
    expect(state.markFailure).not.toHaveBeenCalled();
    expect(state.release).toHaveBeenCalledOnce();
  });
});
