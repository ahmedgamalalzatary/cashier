import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  isNotNull,
  sql,
} from "drizzle-orm";
import type { Db } from "@cashier/db";
import {
  branches,
  shifts,
  users,
  externalCatalogSync,
  externalCategories,
  externalProducts,
  externalProductSizes,
  externalModifierGroups,
  externalModifierOptions,
  adminBranches,
} from "@cashier/db";
import type { BranchInput, BranchUpdateInput } from "./branches.schemas.js";

export class BranchesRepository {
  constructor(private db: Db) {}

  transaction<T>(action: (repo: BranchesRepository) => Promise<T>) {
    return this.db.transaction((tx) =>
      action(new BranchesRepository(tx as unknown as Db)),
    );
  }
  list(branchId?: string, adminUserId?: string) {
    return this.db
      .select()
      .from(branches)
      .where(
        and(
          branchId === undefined ? undefined : eq(branches.id, branchId),
          adminUserId === undefined
            ? undefined
            : sql`EXISTS (SELECT 1 FROM ${adminBranches} WHERE ${adminBranches.branchId} = ${branches.id} AND ${adminBranches.adminUserId} = ${adminUserId})`,
        ),
      )
      .orderBy(asc(branches.id));
  }
  async get(id: string) {
    const [row] = await this.db
      .select()
      .from(branches)
      .where(eq(branches.id, id));
    return row;
  }
  lockAll() {
    return this.db
      .select()
      .from(branches)
      .orderBy(asc(branches.id))
      .for("update");
  }
  async hasOpenShift(id: string) {
    const [row] = await this.db
      .select({ id: shifts.id })
      .from(shifts)
      .innerJoin(users, eq(shifts.cashierUserId, users.id))
      .where(and(eq(users.branchId, id), eq(shifts.status, "open")))
      .limit(1);
    return !!row;
  }
  async create(input: BranchInput) {
    const [result] = await this.db
      .insert(branches)
      .values(input)
      .$returningId();
    return result.id;
  }
  async copyCatalog(branchId: string) {
    const [source] = await this.db
      .select({
        branchId: externalCatalogSync.branchId,
        lastSuccessfulSyncAt: externalCatalogSync.lastSuccessfulSyncAt,
      })
      .from(externalCatalogSync)
      .innerJoin(branches, eq(branches.id, externalCatalogSync.branchId))
      .where(
        and(
          eq(branches.isActive, true),
          isNotNull(externalCatalogSync.lastSuccessfulSyncAt),
        ),
      )
      .orderBy(desc(externalCatalogSync.lastSuccessfulSyncAt))
      .limit(1);
    if (!source) return;
    // Copy backend catalog fields only. Branch stock mappings and modifier
    // consumption decisions must be configured independently in the new branch.
    for (const table of [
      externalCategories,
      externalProducts,
      externalProductSizes,
      externalModifierGroups,
      externalModifierOptions,
    ]) {
      const columns = Object.entries(getTableColumns(table));
      const names = columns.map(([, column]) => sql.identifier(column.name));
      const values = columns.map(([property, column]) =>
        property === "branchId"
          ? sql`${branchId}`
          : property === "stockEffect"
            ? sql`'incomplete'`
            : sql`${column}`,
      );
      await this.db
        .execute(sql`INSERT INTO ${table} (${sql.join(names, sql`, `)})
        SELECT ${sql.join(values, sql`, `)} FROM ${table} WHERE ${table.branchId}=${source.branchId}`);
    }
    await this.db.insert(externalCatalogSync).values({
      id: 1,
      branchId,
      lastSuccessfulSyncAt: source.lastSuccessfulSyncAt,
      lastAttemptAt: source.lastSuccessfulSyncAt,
    });
  }
  async update(id: string, input: BranchUpdateInput) {
    await this.db.update(branches).set(input).where(eq(branches.id, id));
    if (input.isActive === false) {
      await this.db
        .update(users)
        .set({ tokenVersion: sql`${users.tokenVersion}+1` })
        .where(and(eq(users.branchId, id), eq(users.role, "cashier")));
    }
  }
}
