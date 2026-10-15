import {
  branchCondition,
  branchTransaction,
  branchValues,
  currentBranchId,
  quoteIdentifier,
} from "@cashier/db";
import { getTableConfig, type AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import {
  externalCategories,
  externalModifierGroups,
  externalModifierOptions,
  externalProducts,
  externalProductSizes,
} from "@cashier/db";

const INSERT_CHUNK_SIZE = 250;

export const chunks = <T>(rows: T[]) => {
  const result: T[][] = [];
  for (let index = 0; index < rows.length; index += INSERT_CHUNK_SIZE) {
    result.push(rows.slice(index, index + INSERT_CHUNK_SIZE));
  }
  return result;
};

type CatalogTable =
  | typeof externalCategories
  | typeof externalProducts
  | typeof externalProductSizes
  | typeof externalModifierGroups
  | typeof externalModifierOptions;
type CatalogTx = Parameters<Parameters<typeof branchTransaction>[1]>[0];

/**
 * Every write to the catalog tables is queued for the online backup, and MySQL
 * runs the capture trigger even when an upsert leaves a row identical. New rows
 * are inserted; existing rows are updated only where MySQL finds a value that
 * differs, so an unchanged catalog queues nothing.
 */
export async function writeChangedRows(
  tx: CatalogTx,
  table: CatalogTable,
  rows: Array<{ externalId: number }>,
  now: Date,
  fields: string[],
) {
  if (!rows.length) return;
  const known = new Set(
    (
      await tx
        .select({ externalId: table.externalId })
        .from(table)
        .where(branchCondition(table))
    ).map((row) => row.externalId),
  );
  const fresh = rows
    .filter((row) => !known.has(row.externalId))
    .map((row) => ({ ...row, syncedAt: now, isCurrent: true }));
  for (const chunk of chunks(fresh))
    await tx.insert(table).values(branchValues(chunk) as never);
  const existing = rows.filter((row) => known.has(row.externalId));
  const columns = table as unknown as Record<string, AnyMySqlColumn>;
  const name = (field: string) => sql.raw(quoteIdentifier(columns[field].name));
  const value = (row: Record<string, unknown>, field: string) =>
    row[field] === null || row[field] === undefined
      ? null
      : columns[field].mapToDriverValue(row[field]);
  const target = sql.raw(quoteIdentifier(getTableConfig(table).name));
  for (const chunk of chunks(existing)) {
    const tuples = chunk.map(
      (row) =>
        sql`ROW(${sql.join(
          [
            sql`${row.externalId}`,
            ...fields.map(
              (field) => sql`${value(row as Record<string, unknown>, field)}`,
            ),
          ],
          sql`, `,
        )})`,
    );
    await tx.execute(sql`UPDATE ${target} JOIN (VALUES ${sql.join(tuples, sql`, `)}) AS incoming (external_id, ${sql.join(fields.map(name), sql`, `)})
      ON ${target}.external_id = incoming.external_id
      SET ${sql.join(
        fields.map(
          (field) => sql`${target}.${name(field)} = incoming.${name(field)}`,
        ),
        sql`, `,
      )}, ${target}.synced_at = ${columns.syncedAt.mapToDriverValue(now)}, ${target}.is_current = TRUE
      WHERE ${target}.branch_id = ${currentBranchId()}
        AND (${target}.is_current = FALSE OR ${sql.join(
          fields.map(
            (field) =>
              sql`NOT (${target}.${name(field)} <=> incoming.${name(field)})`,
          ),
          sql` OR `,
        )})`);
  }
}
