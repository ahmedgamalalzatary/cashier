import { and, eq, gt,ne, sql } from "drizzle-orm";
import { devices,syncIngestEvents,syncIngestRows,syncIngestPending,uploadTables,quoteIdentifier,type Db } from "@cashier/db";
import { HttpError } from "../../middleware/error.js";
import { BackupGenerationError,rowKey,assertOwnership,upsertStatement } from "./ingest.js";

/** The same operation ID returns the same server-issued generation after a retry. */
export async function beginBackupGeneration(db:Db,device:{id:string;branchId:string},requestId:string,minimumGeneration:number,replace=false,replaceAll=false){
  return db.transaction(async tx=>{
    const [current]=await tx.select().from(devices).where(eq(devices.id,device.id)).for("update");
    if(!current) throw new HttpError(401,"This PC was unlinked.");
    if(current.backupRequestId===requestId) return {generation:current.backupGeneration};
    const generation=Math.max(current.backupGeneration,minimumGeneration)+1;
    if(!Number.isSafeInteger(generation)) throw new HttpError(409,"Backup generation limit reached.");
    await tx.update(devices).set({backupGeneration:generation,backupRequestId:requestId,backupCompletedAt:null,backupReplace:replace,backupReplaceAll:replaceAll}).where(eq(devices.id,device.id));
    // Existing reports stay available while the PC uploads the new snapshot.
    // Old requests are fenced by the device lock and the generation check.
    return {generation};
  });
}

/** Rows removed per DELETE when a replacement backup is reconciled. */
const DELETE_BATCH=500;

/** Reconcile absence only after the client has uploaded its complete snapshot. */
export async function completeBackupGeneration(db:Db,device:{id:string;branchId:string},generation:number){
  await db.transaction(async tx=>{
    const [current]=await tx.select().from(devices).where(eq(devices.id,device.id)).for("update");
    if(!current) throw new HttpError(401,"This PC was unlinked.");
    if(current.backupGeneration!==generation) throw new BackupGenerationError();
    if(current.backupCompletedAt) return;
    await tx.execute(sql`SET @cashier_sync_apply=1`);
    await tx.execute(sql`SET FOREIGN_KEY_CHECKS=0`);
    try {
      for(const table of current.backupReplace ? uploadTables : []){
        const name=sql.raw(quoteIdentifier(table.name));
        const scope=sql`branch_id=${device.branchId}${table.cashiersOnly?sql` AND role='cashier'`:sql``}`;
        // A full resend replaces the whole branch: one statement, no row scan.
        if(current.backupReplaceAll){await tx.execute(sql`DELETE FROM ${name} WHERE ${scope}`);continue;}
        const versions=await tx.select({rowKey:syncIngestRows.rowKey}).from(syncIngestRows).where(and(eq(syncIngestRows.deviceId,device.id),eq(syncIngestRows.tableName,table.name)));
        if(!versions.length) continue;
        const owned=new Set(versions.map(row=>row.rowKey));
        const [rows]=await tx.execute(sql`SELECT ${sql.raw(table.keys.map(quoteIdentifier).join(","))} FROM ${name} WHERE ${scope} FOR UPDATE`) as unknown as [Record<string,unknown>[],unknown];
        const absent=rows.filter(pk=>owned.has(rowKey(table.name,pk)));
        // Rows this device uploaded are removed in batches, not one statement each.
        const columns=sql.raw(`(${table.keys.map(quoteIdentifier).join(",")})`);
        for(let start=0;start<absent.length;start+=DELETE_BATCH){
          const tuples=absent.slice(start,start+DELETE_BATCH).map(pk=>sql`(${sql.join(table.keys.map(key=>sql`${pk[key]}`),sql`,`)})`);
          await tx.execute(sql`DELETE FROM ${name} WHERE ${columns} IN (${sql.join(tuples,sql`,`)})`);
        }
      }
      if(current.backupReplace){
        for(const table of uploadTables){
          let cursor="";
          for(;;){
            const rows=await tx.select().from(syncIngestPending).where(and(eq(syncIngestPending.deviceId,device.id),eq(syncIngestPending.generation,generation),eq(syncIngestPending.tableName,table.name),gt(syncIngestPending.rowKey,cursor))).orderBy(syncIngestPending.rowKey).limit(500);
            if(!rows.length) break;
            for(const row of rows){
              if(row.op!=="upsert" || !row.rowJson) continue;
              await assertOwnership(tx,table,row.rowJson,row.pk,device.branchId);
              await tx.execute(upsertStatement(table,row.rowJson));
            }
            cursor=rows.at(-1)!.rowKey;
          }
        }
      }
      // Age alone is never a reason to prune. Old generations are now fenced
      // and the new source snapshot has been confirmed, so their state is safe
      // to remove; current-generation tombstones remain protected.
      await tx.delete(syncIngestEvents).where(and(eq(syncIngestEvents.deviceId,device.id),ne(syncIngestEvents.generation,generation)));
      if(current.backupReplace) await tx.delete(syncIngestRows).where(and(eq(syncIngestRows.deviceId,device.id),ne(syncIngestRows.generation,generation)));
      await tx.delete(syncIngestPending).where(eq(syncIngestPending.deviceId,device.id));
      await tx.update(devices).set({backupCompletedAt:new Date(),lastUploadAt:new Date()}).where(eq(devices.id,device.id));
    } finally {
      await tx.execute(sql`SET FOREIGN_KEY_CHECKS=1`);
      await tx.execute(sql`SET @cashier_sync_apply=0`);
    }
  });
  return {generation};
}
