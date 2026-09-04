import { describe, expect, it } from "vitest";
import {
  catalogRefreshOutcome,
  requestCatalogRefresh,
} from "../../src/models/catalog-refresh";

const requestedAt = "2026-08-21T16:43:15.232Z";

describe("catalog refresh status", () => {
  it("stops refreshing and preserves the error when requesting refresh fails", async () => {
    let refreshing = false;
    let error = "";

    await requestCatalogRefresh({
      refresh: async () => {
        throw new Error("الخدمة الخارجية غير متاحة");
      },
      setRefreshing: (value) => {
        refreshing = value;
      },
      setError: (value) => {
        error = value;
      },
    });

    expect(refreshing).toBe(false);
    expect(error).toBe("الخدمة الخارجية غير متاحة");
  });

  it("reports an unclaimed refresh request as unavailable after 30 seconds", () => {
    expect(
      catalogRefreshOutcome(
        {
          lastAttemptAt: "2026-08-21T15:33:39.000Z",
          lastSuccessfulSyncAt: "2026-08-18T14:53:31.000Z",
          lastFailedAt: null,
          lastError: "تعذر الاتصال بالخدمة الخارجية",
          refreshRequestedAt: requestedAt,
          refreshing: false,
        },
        new Date("2026-08-21T16:43:46.000Z").getTime(),
      ),
    ).toBe("worker-unavailable");
  });

  it("keeps waiting while a worker owns the refresh", () => {
    expect(
      catalogRefreshOutcome(
        {
          lastAttemptAt: "2026-08-21T16:43:20.000Z",
          lastSuccessfulSyncAt: null,
          lastFailedAt: null,
          lastError: null,
          refreshRequestedAt: requestedAt,
          refreshing: true,
        },
        new Date("2026-08-21T17:00:00.000Z").getTime(),
      ),
    ).toBe("pending");
  });
});
