import type { ExternalCacheRefreshStatus } from "@cashier/shared";

const WORKER_PICKUP_TIMEOUT_MS = 30_000;

export type CatalogRefreshOutcome =
  "pending" | "succeeded" | "failed" | "worker-unavailable";

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
