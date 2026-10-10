import { eq, inArray, sql } from "drizzle-orm";
import { syncOutbox, syncState, type Db } from "@cashier/db";
import {gzip} from "node:zlib";
import {promisify} from "node:util";
const compress=promisify(gzip);

const DEFAULT_BATCH_SIZE = 500;

/** One upload at a time; a second caller waits rather than racing the first. */
let uploading: Promise<UploadResult> | undefined;

export type UploadResult = { uploaded: number; pending: number };

export type SendBatch = (
  body: UploadBatch,
) => Promise<{ generation?:number; acknowledgedSeqs: number[] }>;

export type UploadOptions = {
  apiUrl: string;
  deviceToken: string;
  appVersion: string;
  migrationCheckpoint: number;
  batchSize?: number;
  timeoutMs?: number;
  send?: SendBatch;
  signal?: AbortSignal;
  generation?:number;
  onAcknowledged?:(sequences:number[])=>void|Promise<void>;
};

/** The database's own migration checkpoint, sent with every batch (plan 7.4). */
export async function migrationCheckpoint(db: Db) {
  const [rows] = await db.$client.query(
    "SELECT MAX(created_at) AS checkpoint FROM __drizzle_migrations",
  );
  return Number(
    (rows as Array<{ checkpoint: number | string }>)[0]?.checkpoint ?? 0,
  );
}

export async function pendingCount(db: Db) {
  const [rows] = await db.$client.query(
    "SELECT COUNT(*) AS pending FROM sync_outbox",
  );
  return Number((rows as Array<{ pending: number | string }>)[0]?.pending ?? 0);
}

/** The next start forgets the revoked token and shows the link screen. */
export const UNLINKED_MESSAGE =
  "هذا الجهاز أُلغي ربطه بموقع كاشير. أغلق كاشير وافتحه من جديد لربطه مرة أخرى. This PC was unlinked. Close and reopen Cashier to link it again.";

export class UnlinkedError extends Error {
  constructor() {
    super(UNLINKED_MESSAGE);
  }
}

export type UploadBatch = {
  appVersion: string;
  migrationCheckpoint: number;
  generation?:number;
  rows: Array<{
    seq: number;
    table: string;
    op: "upsert" | "delete";
    pk: Record<string, unknown>;
    row?: Record<string, unknown> | null;
  }>;
};

/**
 * Posts one batch to online. Requests are bounded, and an unlinked PC is
 * reported distinctly so the worker can stop instead of retrying forever.
 */
export class GenerationChangedError extends Error {}

/** Shown on the backup card when online cannot be reached or does not answer. */
export const UNREACHABLE_MESSAGE =
  "تعذر الاتصال بموقع كاشير. البيانات محفوظة على هذا الجهاز وسيتم رفعها تلقائيًا عند عودة الاتصال.";

export async function requestDeviceJson(
  { apiUrl, deviceToken, appVersion, signal, timeoutMs = 30_000 }: UploadOptions,
  endpoint:string,
  body:unknown,
  { fetch }: { fetch?: typeof globalThis.fetch } = {},
): Promise<unknown> {
  const send = fetch ?? globalThis.fetch;
  signal?.throwIfAborted();
  const controller = new AbortController();
  const stop = () => controller.abort();
  signal?.addEventListener("abort", stop, { once: true });
  const timer = setTimeout(stop, timeoutMs);
  try {
    const encoded=JSON.stringify(body);
    const compressed=endpoint==="ingest" ? new Uint8Array(await compress(encoded)) : encoded;
    controller.signal.throwIfAborted();
    const response = await send(`${apiUrl}/device/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Device ${deviceToken}`,
        "X-Cashier-Version": appVersion,
        ...(endpoint==="ingest"?{"Content-Encoding":"gzip"}:{}),
      },
      body: compressed,
      signal: controller.signal,
    }).catch((error: unknown) => {
      // A shutdown stays an abort so the worker stops; anything else means the
      // site could not be reached, which the backup card shows as is.
      if (signal?.aborted) throw error;
      throw new Error(UNREACHABLE_MESSAGE, { cause: error });
    });
    if (response.status === 401) throw new UnlinkedError();
    if (response.status === 409) {
      const problem=await response.json().catch(()=>null) as {code?:string;error?:string}|null;
      if(problem?.code==="BACKUP_GENERATION_MISMATCH") throw new GenerationChangedError(problem.error);
      throw new Error(problem?.error??"This PC's data format is newer or incompatible with the site. Update the site first.");
    }
    if (!response.ok)
      throw new Error(`Upload failed (${response.status}). Nothing was lost.`);
    return await response.json().catch(()=>undefined);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
}

export async function requestUploadBatch(options:UploadOptions,body:UploadBatch,transport:{fetch?:typeof globalThis.fetch}={}) {
  const answer=await requestDeviceJson(options,"ingest",body,transport) as {generation?:number;acknowledgedSeqs?:unknown}|undefined;
  const acknowledged=answer?.acknowledgedSeqs;
  if(!Array.isArray(acknowledged)||acknowledged.some(seq=>!Number.isSafeInteger(seq)||seq<=0)) throw new Error("The site sent an unreadable answer. Nothing was lost.");
  if((body.generation??0)>0 && answer?.generation!==body.generation) throw new GenerationChangedError("The site acknowledged a different backup generation.");
  return {...(answer?.generation!==undefined?{generation:answer.generation}:{}),acknowledgedSeqs:acknowledged as number[]};
}

const readBatch = (db: Db, limit: number) =>
  db
    .select()
    .from(syncOutbox)
    .orderBy(syncOutbox.seq)
    .limit(limit);

/** The ceiling the site accepts, kept in step with its body parser. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Batches by row count *and* by encoded size. Counting rows alone built
 * requests the site refuses, and the uploader then picked the same oversized
 * rows again on every retry, so a single fat row could stall the whole queue.
 * A row that is too large on its own is still sent, so it surfaces as a real
 * error instead of looping forever.
 */
function splitBySize<T extends { seq: number }>(
  rows: T[],
  limit: number,
  toRow: (row: T) => UploadBatch["rows"][number],
  envelope:number,
) {
  const batches: UploadBatch["rows"][] = [];
  let current: UploadBatch["rows"] = [];
  let currentBytes = 0;
  for (const row of rows) {
    const encoded = Buffer.byteLength(JSON.stringify(toRow(row)));
    const fits = current.length > 0 && currentBytes + encoded + current.length + envelope > MAX_BODY_BYTES;
    if (current.length >= limit || fits) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(toRow(row));
    currentBytes += encoded;
  }
  if (current.length) batches.push(current);
  return batches;
}

async function writeState(
  db: Db,
  change: Partial<typeof syncState.$inferInsert>,
) {
  await db
    .insert(syncState)
    .values({ id: 1, ...change })
    .onDuplicateKeyUpdate({ set: change });
}

/**
 * Sends everything still queued, a batch at a time, and deletes only the exact
 * sequences online acknowledged (plan T3). Rows stay queued on any failure, so
 * selling is never blocked and nothing is lost.
 */
export async function uploadPending(db: Db, options: UploadOptions) {
  const run = async (): Promise<UploadResult> => {
    const send =
      options.send ?? ((batch) => requestUploadBatch(options, batch));
    const limit = Math.min(options.batchSize ?? DEFAULT_BATCH_SIZE,DEFAULT_BATCH_SIZE);
    if(!Number.isSafeInteger(limit)||limit<=0) throw new Error("Upload batch size must be a positive integer.");
    let uploaded = 0;
    await writeState(db, { lastAttemptAt: new Date() });
    try {
      for (;;) {
        options.signal?.throwIfAborted();
        const rows = await readBatch(db, limit);
        if (!rows.length) break;
        const envelope=Buffer.byteLength(JSON.stringify({appVersion:options.appVersion,migrationCheckpoint:options.migrationCheckpoint,generation:options.generation??0,rows:[]}));
        const batches = splitBySize(rows, limit, (row) => ({
          seq: row.seq,
          table: row.tableName,
          op: row.op,
          pk: row.pk,
          row: row.rowJson,
        }),envelope);
        let answered = false;
        for (const part of batches) {
          const answer = await send({
            appVersion: options.appVersion,
            migrationCheckpoint: options.migrationCheckpoint,
            generation:options.generation??0,
            rows: part,
          });
        const sent = new Set(part.map((row) => row.seq));
          // Only sequences that were both sent and acknowledged may be deleted.
          if (!Array.isArray(answer.acknowledgedSeqs) || answer.acknowledgedSeqs.some(seq=>!Number.isSafeInteger(seq)||seq<=0||!sent.has(seq)))
            throw new Error("The site sent an invalid acknowledgment answer. Nothing was lost.");
          if((options.generation??0)>0 && answer.generation!==options.generation) throw new GenerationChangedError("The site acknowledged a different backup generation.");
          const deletable = [
            ...new Set(
              answer.acknowledgedSeqs.filter((seq) => sent.has(seq)),
            ),
          ].sort((a, b) => a - b);
          if (deletable.length) {
            await options.onAcknowledged?.(deletable);
            await db.transaction(async (tx) => {
              await tx.delete(syncOutbox).where(inArray(syncOutbox.seq, deletable));
              // Diagnostic maximum only; never a read or deletion cutoff.
              const highest = deletable.at(-1)!;
              await tx
                .insert(syncState)
                .values({
                  id: 1,
                  lastUploadedSeq: highest,
                  lastSuccessAt: new Date(),
                  lastError: null,
                })
                .onDuplicateKeyUpdate({
                  set: {
                    lastSuccessAt: new Date(),
                    lastError: null,
                    lastUploadedSeq: sql`GREATEST(last_uploaded_seq, ${highest})`,
                  },
                });
            });
            uploaded += deletable.length;
            answered = true;
            if (deletable.length < part.length)
              return {uploaded,pending:await pendingCount(db)};
          }
          // A site that acknowledged nothing would otherwise loop forever.
          if (!deletable.length) break;
        }
        if (!answered) break;
      }
    } catch (error) {
      await writeState(db, {
        lastError: error instanceof Error ? error.message : "Upload failed.",
      }).catch(() => undefined);
      throw error;
    }
    return { uploaded, pending: await pendingCount(db) };
  };
  const previous = uploading;
  const mine = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(
    run,
  );
  uploading = mine;
  try {
    return await mine;
  } finally {
    // Only the caller that owns the current lock may clear it. Clearing
    // unconditionally let an earlier, already-finished caller's `finally`
    // release the lock while callers queued behind it were still running, so
    // a new caller could start a second send alongside them.
    if (uploading === mine) uploading = undefined;
  }
}

/** What the backup card shows (plan 7.6). */
export async function readSyncStatus(db: Db) {
  const [state] = await db
    .select()
    .from(syncState)
    .where(eq(syncState.id, 1))
    .limit(1);
  return {
    lastUploadedSeq: state?.lastUploadedSeq ?? 0,
    lastSuccessAt: state?.lastSuccessAt ?? null,
    lastAttemptAt: state?.lastAttemptAt ?? null,
    lastError: state?.lastError ?? null,
    pending: await pendingCount(db),
  };
}

export type SyncStatus = Awaited<ReturnType<typeof readSyncStatus>>;

/** Uploads every 15 minutes; failures never stop selling (plan D10). */
export function runUploadLoop(
  upload: () => Promise<unknown>,
  signal: AbortSignal,
  reportError: (error: unknown) => void = (error) =>
    console.error(
      error instanceof Error ? error.message : "Backup upload failed.",
    ),
  intervalMs = 15 * 60_000,
) {
  return (async () => {
    while (!signal.aborted) {
      try {
        await upload();
      } catch (error) {
        if (!signal.aborted) reportError(error);
      }
      if (signal.aborted) return;
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", finish);
          resolve();
        };
        const timer = setTimeout(finish, intervalMs);
        signal.addEventListener("abort", finish, { once: true });
        if (signal.aborted) finish();
      });
    }
  })();
}
