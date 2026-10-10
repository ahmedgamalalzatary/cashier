import { and, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  devices,
  syncIngestEvents,
  syncIngestRows,
  syncIngestPending,
  quoteIdentifier,
  uploadTable,
  type Db,
  type UploadTable,
} from "@cashier/db";
import { HttpError } from "../../middleware/error.js";

type TableInfo = UploadTable;

/** The transaction handle drizzle passes to a `db.transaction` callback. */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Identifies a business row independently of its sequence. */
export const rowKey = (_table: string, pk: Record<string, unknown>) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        Object.keys(pk)
          .sort()
          .map((key) => [key, String(pk[key])]),
      ),
    )
    .digest("hex");

export type IngestRow = {
  seq: number;
  table: string;
  op: "upsert" | "delete";
  pk: Record<string, unknown>;
  row?: Record<string, unknown> | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Refuses anything outside the device's own branch before any write happens. */
function validateRow(
  entry: IngestRow,
  branchId: string,
): { table: TableInfo; pk: Record<string, unknown>; row: Record<string, unknown> | null } {
  const table = uploadTable(entry.table);
  if (!table)
    throw new HttpError(422, "الجدول المرفوع غير معروف على الخادم");
  if (!Number.isSafeInteger(entry.seq) || entry.seq <= 0)
    throw new HttpError(422, "رقم التسلسل المرفوع غير صالح");
  if (!isRecord(entry.pk))
    throw new HttpError(422, "معرف الصف المرفوع غير صالح");
  // The key is used to find the row to protect; extra keys would make the
  // version identity disagree with the row actually being written.
  const keyNames = new Set(table.keys);
  if (Object.keys(entry.pk).some((key) => !keyNames.has(key)))
    throw new HttpError(422, "معرف الصف يحتوي مفتاحاً غير موجود في الجدول");
  for (const key of table.keys)
    if (entry.pk[key] === undefined)
      throw new HttpError(422, `معرف الصف لا يحتوي على ${key}`);
  // Ownership is checked on the key for deletes too: the source row is gone.
  if (String(entry.pk.branch_id) !== branchId)
    throw new HttpError(422, "الصف المرفوع لا يخص فرع هذا الجهاز");
  if (entry.op === "delete") return { table, pk: entry.pk, row: null };
  if (!isRecord(entry.row))
    throw new HttpError(422, "بيانات الصف المرفوعة مفقودة");
  const names = new Set(table.columns.map((column) => column.name));
  if (Object.keys(entry.row).some((key) => !names.has(key)))
    throw new HttpError(422, "الصف المرفوع يحتوي عموداً غير موجود في الجدول");
  for (const key of table.keys) {
    if (entry.row[key] === undefined)
      throw new HttpError(422, `بيانات الصف لا تحتوي على ${key}`);
    // A key that disagrees with the row it claims to identify would protect one
    // row's version while writing a different row.
    if (String(entry.row[key]) !== String(entry.pk[key]))
      throw new HttpError(422, "معرف الصف لا يطابق بيانات الصف المرفوعة");
  }
  if (
    table.cashiersOnly &&
    entry.row.role !== "cashier" &&
    entry.row.role !== undefined
  )
    throw new HttpError(422, "لا تُرفع حسابات المديرين");
  if (String(entry.row.branch_id) !== branchId)
    throw new HttpError(422, "الصف المرفوع لا يخص فرع هذا الجهاز");
  return { table, pk: entry.pk, row: entry.row };
}

/** `tx.execute` hands back rows directly; normalise either shape defensively. */
const rowsOf = (result: unknown): Array<Record<string, unknown>> => {
  const [head] = (result ?? []) as unknown[];
  return (Array.isArray(head) ? head : ((result ?? []) as unknown[])).filter(
    (row): row is Record<string, unknown> => typeof row === "object" && row !== null,
  );
};

/**
 * A write must never land on a row that belongs to somebody else. The primary
 * key is not the only door in: a submitted row can also collide with a unique
 * column, and ON DUPLICATE KEY UPDATE would happily move that other branch's
 * row over to this device. Every row the write could possibly touch is therefore
 * looked up first, and any row outside this branch refuses the whole batch.
 */
export const assertOwnership = async (
  tx: Tx,
  table: TableInfo,
  row: Record<string, unknown> | null,
  pk: Record<string, unknown>,
  branchId: string,
  allowSameBranchConflict=false,
) => {
  const lookups: Record<string, unknown>[] = [Object.fromEntries(table.primaryKeys.map(key=>[key,pk[key]]))];
  if (row)
    for (const keys of table.uniqueKeys)
      if (keys.every(key=>row[key] !== null && row[key] !== undefined))
        lookups.push(Object.fromEntries(keys.map(key=>[key,row[key]])));
  const condition = lookups
    .map((lookup) =>
      sql`(${sql.join(
        Object.entries(lookup).map(
          ([column, value]) => sql`${sql.raw(quoteIdentifier(column))} = ${value}`,
        ),
        sql` AND `,
      )})`,
    )
    .reduce((left, right) => sql`(${left}) OR (${right})`);
  const found = await tx.execute(
    sql`SELECT ${sql.raw([...new Set(["branch_id",...table.primaryKeys])].map(quoteIdentifier).join(","))} FROM ${sql.raw(quoteIdentifier(table.name))} WHERE ${condition} FOR UPDATE`,
  );
  const owners = rowsOf(found).map(
    (record) => record.branch_id,
  );
  if (owners.some((owner) => String(owner) !== branchId))
    throw new HttpError(
      422,
      "الصف المرفوع يتعارض مع صف يخص فرعاً آخر",
    );
  if (!allowSameBranchConflict && row && rowsOf(found).some(record=>table.primaryKeys.some(key=>String(record[key])!==String(pk[key]))))
    throw new HttpError(422,"An uploaded identity conflicts with another existing row.");
};

/**
 * Statements are built from schema-derived identifiers only; every value is
 * bound as a parameter, never interpolated.
 */
export const upsertStatement = (table: TableInfo, row: Record<string, unknown>) => {
  const columns = Object.keys(row);
  const assignments = columns.map(
    (column) =>
      sql`${sql.raw(quoteIdentifier(column))} = VALUES(${sql.raw(quoteIdentifier(column))})`,
  );
  return sql`INSERT INTO ${sql.raw(quoteIdentifier(table.name))} (${sql.join(
    columns.map((column) => sql.raw(quoteIdentifier(column))),
    sql`, `,
  )}) VALUES (${sql.join(
    Object.values(row).map((value) => sql`${value}`),
    sql`, `,
  )}) ON DUPLICATE KEY UPDATE ${sql.join(assignments, sql`, `)}`;
};

const deleteStatement = (table: TableInfo, pk: Record<string, unknown>) =>
  sql`DELETE FROM ${sql.raw(quoteIdentifier(table.name))} WHERE ${sql.join(
    table.keys.map((key) => sql`${sql.raw(quoteIdentifier(key))} = ${pk[key]}`),
    sql` AND `,
  )}`;

/** The newest migration this server has applied (plan 7.4 schema check). */
const serverCheckpoints = async (db: Db) => {
  const [rows] = await db.$client.query(
    "SELECT DISTINCT created_at AS checkpoint FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 2",
  );
  return (rows as Array<{checkpoint:number|string}>).map(row=>Number(row.checkpoint));
};

export class BackupGenerationError extends HttpError {
  readonly code="BACKUP_GENERATION_MISMATCH";
  constructor(){super(409,"The backup generation changed. Start a fresh backup generation.");}
}

/**
 * Applies one uploaded batch atomically and acknowledges exactly the sequences
 * it accepted (plan T3). Every accepted event is recorded per device and every
 * row keeps its newest sequence, so a retry — even of an older batch after
 * newer data arrived — changes nothing. A lower sequence for a row never seen
 * before is applied like any other: nothing is discarded by a high-water mark.
 */
export async function ingestBatch(
  db: Db,
  device: { id: string; branchId: string },
  batch: { migrationCheckpoint: number; generation?:number; rows: IngestRow[] },
) {
  if (!(await serverCheckpoints(db)).includes(batch.migrationCheckpoint))
    throw new HttpError(
      409,
      "إصدار قاعدة البيانات على الجهاز أحدث من الخادم. حدّث الخادم أولًا.",
    );
  const accepted = batch.rows.map((entry) => validateRow(entry, device.branchId));
  const acknowledgedSeqs = batch.rows.map((entry) => entry.seq);
  if(new Set(acknowledgedSeqs).size!==acknowledgedSeqs.length) throw new HttpError(422,"A batch cannot reuse a sequence for multiple events.");
  const generation=batch.generation??0;

  await db.transaction(async (tx) => {
    const [current]=await tx.select().from(devices).where(eq(devices.id,device.id)).for("update");
    if(!current) throw new HttpError(401,"This PC was unlinked.");
    if(current.backupGeneration!==generation) throw new BackupGenerationError();
    const staging=current.backupReplace && !current.backupCompletedAt;
    await tx.execute(sql`SET @cashier_sync_apply = 1`);
    // Uploaded rows arrive in any order and reference rows sent in other
    // batches, so key order cannot be enforced while applying them.
    await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
    try {
      const seen = new Set<number>();
      const entries = batch.rows
        .map((entry, index) => ({ entry, checked: accepted[index] }))
        .sort((a, b) => a.entry.seq - b.entry.seq);
      for (const { entry, checked } of entries) {
        if (seen.has(entry.seq)) continue;
        seen.add(entry.seq);
        const [known] = await tx
          .select({ seq: syncIngestEvents.seq })
          .from(syncIngestEvents)
          .where(
            and(
              eq(syncIngestEvents.deviceId, device.id),
              eq(syncIngestEvents.generation,generation),
              eq(syncIngestEvents.seq, entry.seq),
            ),
          )
          .limit(1);
        if (known) continue;
        const key = rowKey(entry.table, checked.pk);
        // The version row is created if it is missing and then locked FOR UPDATE,
        // so two concurrent uploads of the same row cannot both read the old
        // sequence: the second waits, then sees what the first committed and
        // treats itself as the stale one. Reading without this lock let a slow
        // older upload overwrite a newer value.
        await tx.execute(sql`
          INSERT INTO sync_ingest_rows
            (device_id, table_name, row_key, last_seq, applied_at)
          VALUES (${device.id}, ${entry.table}, ${key}, 0, NOW())
          ON DUPLICATE KEY UPDATE last_seq = last_seq
        `);
        const applied = await tx.execute(sql`
          SELECT last_seq, generation FROM sync_ingest_rows
          WHERE device_id = ${device.id}
            AND table_name = ${entry.table}
            AND row_key = ${key}
          FOR UPDATE
        `);
        const lastSeq = Number(rowsOf(applied)[0]?.last_seq ?? 0);
        // An older sequence for a row that has already moved on is stale work.
        if (Number(rowsOf(applied)[0]?.generation??0) === generation && lastSeq >= entry.seq) {
          await tx
            .insert(syncIngestEvents)
            .values({ deviceId: device.id, generation,seq: entry.seq });
          continue;
        }
        await assertOwnership(
          tx,
          checked.table,
          checked.row,
          checked.pk,
          device.branchId,
          staging,
        );
        if(staging) {
          const value={deviceId:device.id,generation,tableName:entry.table,rowKey:key,seq:entry.seq,op:entry.op,pk:checked.pk,rowJson:checked.row};
          await tx.insert(syncIngestPending).values(value).onDuplicateKeyUpdate({set:{seq:entry.seq,op:entry.op,pk:checked.pk,rowJson:checked.row}});
        } else if (checked.row)
          await tx.execute(upsertStatement(checked.table, checked.row));
        else await tx.execute(deleteStatement(checked.table, checked.pk));
        await tx
          .insert(syncIngestRows)
          .values({
            deviceId: device.id,
            tableName: entry.table,
            rowKey: key,
            lastSeq: entry.seq,
            generation,
          })
          .onDuplicateKeyUpdate({
            set: {
              lastSeq: entry.seq,
              generation,
              appliedAt: new Date(),
            },
          });
        await tx
          .insert(syncIngestEvents)
          .values({ deviceId: device.id, generation,seq: entry.seq });
      }
      if(!staging) await tx
        .update(devices)
        .set({ lastUploadAt: new Date() })
        .where(eq(devices.id, device.id));
    } finally {
      // Both are session state on a pooled connection; never leak them.
      await tx.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
      await tx.execute(sql`SET @cashier_sync_apply = 0`);
    }
  });

  return { generation,acknowledgedSeqs };
}
