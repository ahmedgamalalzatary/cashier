import { eq } from "drizzle-orm";
import type { Db } from "@cashier/db";
import { branches, devices, linkCodes, syncIngestEvents, syncIngestRows,syncIngestPending } from "@cashier/db";

export class DeviceLinkRepository {
  constructor(private db: Db) {}

  transaction<T>(fn: (repo: DeviceLinkRepository) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) =>
      fn(new DeviceLinkRepository(tx as unknown as Db)),
    );
  }

  /** Locks the code so two PCs typing it at once cannot both use it. */
  async findCodeForUpdate(codeHash: string) {
    const [row] = await this.db
      .select({
        branchId: linkCodes.branchId,
        branchName: branches.name,
        branchIsActive: branches.isActive,
        expiresAt: linkCodes.expiresAt,
        usedAt: linkCodes.usedAt,
      })
      .from(linkCodes)
      .innerJoin(branches, eq(branches.id, linkCodes.branchId))
      .where(eq(linkCodes.codeHash, codeHash))
      .for("update");
    return row;
  }

  async markCodeUsed(codeHash: string, at: Date) {
    await this.db
      .update(linkCodes)
      .set({ usedAt: at })
      .where(eq(linkCodes.codeHash, codeHash));
  }

  /** One PC per branch (plan D1): the branch's previous PC loses its token. */
  async replaceDevice(
    branchId: string,
    tokenHash: string,
    at: Date,
    appVersion?: string,
  ) {
    // The departing PC's deduplication state goes with it: its namespace ends
    // here, and the replacement must start clean rather than inherit another
    // device's accepted sequences. This is not age-based pruning — it is the
    // device being removed.
    const [departing] = await this.db
      .select({ id: devices.id })
      .from(devices)
      .where(eq(devices.branchId, branchId));
    if (departing) {
      await this.db.delete(syncIngestPending).where(eq(syncIngestPending.deviceId,departing.id));
      await this.db
        .delete(syncIngestEvents)
        .where(eq(syncIngestEvents.deviceId, departing.id));
      await this.db
        .delete(syncIngestRows)
        .where(eq(syncIngestRows.deviceId, departing.id));
    }
    await this.db.delete(devices).where(eq(devices.branchId, branchId));
    await this.db
      .insert(devices)
      .values({
        branchId,
        tokenHash,
        linkedAt: at,
        lastSeenAt: at,
        ...(appVersion ? { appVersion } : {}),
      });
  }
}
