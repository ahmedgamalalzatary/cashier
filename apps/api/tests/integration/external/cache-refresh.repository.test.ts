import { describe, expect, it } from "vitest";
import { CacheRefreshRepository } from "../../../src/modules/external/cache-refresh.repository.js";
import { db } from "../../support/setup.js";

describe("durable cache refresh state", () => {
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
