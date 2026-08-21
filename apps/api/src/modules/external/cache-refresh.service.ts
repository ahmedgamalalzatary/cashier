import type { ExternalOrderSummary } from "@cashier/shared";
import type { ExternalCatalog } from "./external-catalog.client.js";

const SUCCESS_INTERVAL_MS = 12 * 60 * 60 * 1_000;
const FAILURE_COOLDOWN_MS = 30 * 1_000;
const LOCK_DURATION_MS = 15 * 60 * 1_000;

export type CacheRefreshState = {
  lastSuccessfulSyncAt: Date | null;
  lastFailedAt: Date | null;
  refreshRequestedAt: Date | null;
  refreshRequestVersion: number;
};

export type CacheRefreshStateStore = {
  getState(): Promise<CacheRefreshState>;
  tryAcquire(owner: string, now: Date, expiresAt: Date): Promise<boolean>;
  renew(owner: string, now: Date, expiresAt: Date): Promise<boolean>;
  markAttempt(now: Date): Promise<void>;
  markSuccess(now: Date, requestVersion: number): Promise<void>;
  markFailure(now: Date, message: string): Promise<void>;
  release(owner: string): Promise<void>;
  request(now: Date): Promise<void>;
};

type CatalogSource = { load(): Promise<ExternalCatalog> };
type CatalogStore = { applyCatalog(catalog: ExternalCatalog): Promise<void> };
type OrdersSource = { listAll(): Promise<ExternalOrderSummary[]> };
type OrdersStore = {
  insertUnseen(orders: ExternalOrderSummary[]): Promise<void>;
};

export class CacheRefreshService {
  constructor(
    private readonly state: CacheRefreshStateStore,
    private readonly catalogSource: CatalogSource,
    private readonly catalogStore: CatalogStore,
    private readonly ordersSource: OrdersSource,
    private readonly ordersStore: OrdersStore,
    private readonly runtime: { now: () => Date; owner: string },
  ) {}

  requestRefresh() {
    return this.state.request(this.runtime.now());
  }

  async runDue(signal?: AbortSignal) {
    const now = this.runtime.now();
    const state = await this.state.getState();
    const requested = state.refreshRequestedAt !== null;
    if (
      !requested &&
      state.lastSuccessfulSyncAt &&
      now.getTime() - state.lastSuccessfulSyncAt.getTime() < SUCCESS_INTERVAL_MS
    ) {
      return false;
    }
    if (
      state.lastFailedAt &&
      now.getTime() - state.lastFailedAt.getTime() < FAILURE_COOLDOWN_MS &&
      (!state.refreshRequestedAt ||
        state.refreshRequestedAt.getTime() <= state.lastFailedAt.getTime())
    ) {
      return false;
    }
    return this.run(now, state.refreshRequestVersion, signal);
  }

  async runForced(signal?: AbortSignal) {
    const state = await this.state.getState();
    return this.run(this.runtime.now(), state.refreshRequestVersion, signal);
  }

  private async run(now: Date, requestVersion: number, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const acquired = await this.state.tryAcquire(
      this.runtime.owner,
      now,
      new Date(now.getTime() + LOCK_DURATION_MS),
    );
    if (!acquired) return false;
    let ownsLease = true;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const renewLease = async () => {
      const current = this.runtime.now();
      const renewed = await this.state.renew(
        this.runtime.owner,
        current,
        new Date(current.getTime() + LOCK_DURATION_MS),
      );
      ownsLease &&= renewed;
      if (!ownsLease) throw new Error("cache refresh lease was lost");
    };
    try {
      await this.state.markAttempt(now);
      heartbeat = setInterval(() => {
        void renewLease().catch(() => undefined);
      }, 60_000);
      const [catalog, orders] = await Promise.all([
        this.catalogSource.load(),
        this.ordersSource.listAll(),
      ]);
      signal?.throwIfAborted();
      await renewLease();
      signal?.throwIfAborted();
      await this.catalogStore.applyCatalog(catalog);
      signal?.throwIfAborted();
      await renewLease();
      signal?.throwIfAborted();
      await this.ordersStore.insertUnseen(orders);
      signal?.throwIfAborted();
      await renewLease();
      signal?.throwIfAborted();
      await this.state.markSuccess(this.runtime.now(), requestVersion);
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "تعذر تحديث الذاكرة المحلية";
      if (ownsLease && !(error instanceof Error && error.name === "AbortError"))
        await this.state.markFailure(this.runtime.now(), message);
      throw error;
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      await this.state.release(this.runtime.owner);
    }
  }
}
