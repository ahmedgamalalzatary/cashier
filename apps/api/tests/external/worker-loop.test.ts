import { afterEach, describe, expect, it, vi } from "vitest";
import { getEventListeners } from "node:events";
import { runRefreshLoop } from "../../src/modules/external/worker-loop.js";

afterEach(() => vi.useRealTimers());

describe("refresh worker lifecycle", () => {
  it("retries failed refreshes without accumulating abort listeners and stops promptly", async () => {
    vi.useFakeTimers();
    const shutdown = new AbortController();
    let attempts = 0;
    const pending = runRefreshLoop(
      async () => {
        attempts++;
        throw new Error("offline");
      },
      shutdown.signal,
      () => undefined,
    );
    await vi.advanceTimersByTimeAsync(100_000);
    expect(attempts).toBeGreaterThan(10);
    expect(
      getEventListeners(shutdown.signal, "abort").length,
    ).toBeLessThanOrEqual(1);
    shutdown.abort();
    await expect(pending).resolves.toBeUndefined();
    const stoppedAt = attempts;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(attempts).toBe(stoppedAt);
  });
});
