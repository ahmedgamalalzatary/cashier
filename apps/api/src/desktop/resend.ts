import { sql } from "drizzle-orm";
import { branches, uploadTables, quoteIdentifier, type Db } from "@cashier/db";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Allocate capture sequences while source rows are still locked. */
export async function captureEverything(tx: Tx) {
  // Normal branch writes take a shared branch lock. This exclusive lock gives
  // recovery a consistent source while INSERT SELECT also locks raw writers.
  await tx.select({id:branches.id}).from(branches).for("update");
  let queued=0;
  for (const table of uploadTables) {
    const object=(names:string[], full=false)=>`JSON_OBJECT(${names.map(name=>{
      const column=table.columns.find(column=>column.name===name)!;
      const value=quoteIdentifier(name);
      return `'${name}', ${full && /^(decimal|timestamp|datetime)/.test(column.getSQLType()) ? `CAST(${value} AS CHAR)` : value}`;
    }).join(",")})`;
    const filter=table.cashiersOnly ? " WHERE `role` = 'cashier'" : "";
    const [result]=await tx.execute(sql.raw(`INSERT INTO sync_outbox (table_name,op,pk,row_json) SELECT '${table.name}','upsert',${object(table.keys)},${object(table.columns.map(column=>column.name),true)} FROM ${quoteIdentifier(table.name)}${filter} FOR SHARE`)) as unknown as [{affectedRows:number},unknown];
    queued+=result.affectedRows;
  }
  return queued;
}

export async function requeueEverything(db: Db) {
  return db.transaction(captureEverything);
}
