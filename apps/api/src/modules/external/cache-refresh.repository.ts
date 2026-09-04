import { and, eq, lte, sql } from "drizzle-orm";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { Db } from "../../db/index.js";
import { externalCatalogSync } from "../../db/schema.js";
import type { CacheRefreshStateStore } from "./cache-refresh.service.js";

export class CacheRefreshRepository implements CacheRefreshStateStore {
  private lockConnection: PoolConnection | null = null;
  private static readonly lockName = "cashier:external-cache-refresh";

  constructor(private readonly db: Db) {}

  private async ensureRow() {
    await this.db
      .insert(externalCatalogSync)
      .values({ id: 1 })
      .onDuplicateKeyUpdate({ set: { id: 1 } });
  }

  async getState() {
    await this.ensureRow();
    const [state] = await this.db
      .select()
      .from(externalCatalogSync)
      .where(eq(externalCatalogSync.id, 1));
    return {
      lastSuccessfulSyncAt: state?.lastSuccessfulSyncAt ?? null,
      lastFailedAt: state?.lastFailedAt ?? null,
      refreshRequestedAt: state?.refreshRequestedAt ?? null,
      refreshRequestVersion: state?.refreshRequestVersion ?? 0,
    };
  }

  async getStatus() {
    await this.ensureRow();
    const [state] = await this.db
      .select()
      .from(externalCatalogSync)
      .where(eq(externalCatalogSync.id, 1));
    return {
      lastAttemptAt: state?.lastAttemptAt ?? null,
      lastSuccessfulSyncAt: state?.lastSuccessfulSyncAt ?? null,
      lastFailedAt: state?.lastFailedAt ?? null,
      lastError: state?.lastError ?? null,
      refreshRequestedAt: state?.refreshRequestedAt ?? null,
      refreshing:
        !!state?.lockExpiresAt && state.lockExpiresAt.getTime() > Date.now(),
    };
  }

  async tryAcquire(owner: string, _now: Date, expiresAt: Date) {
    await this.ensureRow();
    const connection = await this.db.$client.getConnection();
    const [rows] = await connection.query<
      Array<RowDataPacket & { acquired: number }>
    >("SELECT GET_LOCK(?, 0) AS acquired", [CacheRefreshRepository.lockName]);
    if (rows[0]?.acquired !== 1) {
      connection.release();
      return false;
    }
    this.lockConnection = connection;
    await this.db
      .update(externalCatalogSync)
      .set({ lockOwner: owner, lockExpiresAt: expiresAt })
      .where(eq(externalCatalogSync.id, 1));
    return true;
  }

  async markAttempt(now: Date) {
    await this.db
      .update(externalCatalogSync)
      .set({ lastAttemptAt: now })
      .where(eq(externalCatalogSync.id, 1));
  }

  async renew(owner: string, _now: Date, expiresAt: Date) {
    if (!this.lockConnection) return false;
    const [lockRows] = await this.lockConnection.query<
      Array<RowDataPacket & { held: number }>
    >("SELECT IS_USED_LOCK(?) = CONNECTION_ID() AS held", [
      CacheRefreshRepository.lockName,
    ]);
    if (lockRows[0]?.held !== 1) return false;
    await this.db
      .update(externalCatalogSync)
      .set({ lockExpiresAt: expiresAt })
      .where(
        and(
          eq(externalCatalogSync.id, 1),
          eq(externalCatalogSync.lockOwner, owner),
        ),
      );
    const [lease] = await this.db
      .select({ lockOwner: externalCatalogSync.lockOwner })
      .from(externalCatalogSync)
      .where(eq(externalCatalogSync.id, 1));
    return lease?.lockOwner === owner;
  }

  async markSuccess(now: Date, requestVersion: number) {
    await this.db
      .update(externalCatalogSync)
      .set({
        lastSuccessfulSyncAt: now,
        lastError: null,
        completedRequestVersion: sql`GREATEST(
          ${externalCatalogSync.completedRequestVersion},
          ${requestVersion}
        )`,
      })
      .where(eq(externalCatalogSync.id, 1));
    await this.db
      .update(externalCatalogSync)
      .set({ refreshRequestedAt: null })
      .where(
        and(
          eq(externalCatalogSync.id, 1),
          lte(externalCatalogSync.refreshRequestVersion, requestVersion),
        ),
      );
  }

  async markFailure(now: Date, message: string) {
    await this.db
      .update(externalCatalogSync)
      .set({ lastFailedAt: now, lastError: message.slice(0, 500) })
      .where(eq(externalCatalogSync.id, 1));
  }

  async release(owner: string) {
    const connection = this.lockConnection;
    this.lockConnection = null;
    try {
      await this.db
        .update(externalCatalogSync)
        .set({ lockOwner: null, lockExpiresAt: null })
        .where(
          and(
            eq(externalCatalogSync.id, 1),
            eq(externalCatalogSync.lockOwner, owner),
          ),
        );
      if (connection) {
        await connection.query("SELECT RELEASE_LOCK(?)", [
          CacheRefreshRepository.lockName,
        ]);
      }
    } finally {
      connection?.release();
    }
  }

  async request(now: Date) {
    await this.ensureRow();
    await this.db
      .update(externalCatalogSync)
      .set({
        refreshRequestedAt: now,
        refreshRequestVersion: sql`${externalCatalogSync.refreshRequestVersion} + 1`,
      })
      .where(eq(externalCatalogSync.id, 1));
  }
}
