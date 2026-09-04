import type { ExternalCacheRefreshStatus } from "@cashier/shared";

const WORKER_PICKUP_TIMEOUT_MS = 30_000;

export type CatalogRefreshOutcome =
  "pending" | "succeeded" | "failed" | "worker-unavailable";

export async function requestCatalogRefresh({
  refresh,
  setRefreshing,
  setError,
}: {
  refresh: () => Promise<unknown>;
  setRefreshing: (value: boolean) => void;
  setError: (value: string) => void;
}) {
  setRefreshing(true);
  try {
    await refresh();
    setError("");
  } catch (error) {
    setRefreshing(false);
    setError(
      error instanceof Error ? error.message : "تعذر تحديث المنتجات الخارجية",
    );
  }
}

export function catalogRefreshOutcome(
  status: ExternalCacheRefreshStatus,
  nowMs = Date.now(),
): CatalogRefreshOutcome {
  const requestedAt = status.refreshRequestedAt;
  if (!requestedAt) return status.refreshing ? "pending" : "succeeded";
  if (status.lastFailedAt && status.lastFailedAt >= requestedAt)
    return "failed";
  if (status.refreshing) return "pending";

  const requestMs = Date.parse(requestedAt);
  const attemptClaimedRequest =
    status.lastAttemptAt !== null && status.lastAttemptAt >= requestedAt;
  if (
    !attemptClaimedRequest &&
    Number.isFinite(requestMs) &&
    nowMs - requestMs >= WORKER_PICKUP_TIMEOUT_MS
  ) {
    return "worker-unavailable";
  }
  return "pending";
}
