import { is } from "drizzle-orm";
import {
  getTableConfig,
  MySqlTable,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import * as schema from "./schema.js";
import directions from "./sync-directions.json" with {type:"json"};

export type UploadTable = {
  name: string;
  /** Every column, in schema order; the outbox carries all of them. */
  columns: AnyMySqlColumn[];
  /** Primary-key columns plus branch_id, exactly as the triggers build them. */
  keys: string[];
  /** `users` uploads cashiers only; admin rows are owned by online. */
  cashiersOnly: boolean;
  /** The column a filter reads, when the table is filtered. */
  filterColumn?: string;
  filterValue?: string;
  /**
   * Every single-column unique index besides the primary key. A submitted row
   * that collides with one of these could be redirected onto somebody else's
   * row, so ingest checks ownership of any match before it writes.
   */
  uniqueColumns: string[];
  primaryKeys: string[];
  uniqueKeys: string[][];
};

/** Tables that never upload: accounts that come down, and sync bookkeeping. */

/**
 * The upload set (plan 7.1), derived from the schema so a new table cannot be
 * forgotten. The trigger generator, the PC's resend tool and the online ingest
 * endpoint all read this one list.
 */
export function buildUploadTables(directions:Record<string,string[]>):UploadTable[] {
  return (Object.values(schema) as unknown[])
  .filter((value) => is(value, MySqlTable))
  .map((table) => getTableConfig(table))
  .filter(config=>{
    const assigned=directions[config.name];
    if(!assigned) throw new Error(`Missing sync direction: ${config.name}; run db:generate.`);
    return assigned.includes("Up")||assigned.includes("Up (filtered)");
  })
  .map((config) => {
    const primary = (
      config.primaryKeys.length
        ? config.primaryKeys[0].columns
        : config.columns.filter((column) => column.primary)
    ).map((column) => column.name);
    const branch = config.columns.find((column) => column.name === "branch_id");
    if (!primary.length || !branch)
      throw new Error(
        `Upload table needs a primary key and branch_id: ${config.name}`,
      );
    const cashiersOnly = directions[config.name].includes("Up (filtered)");
    const uniqueColumns = config.columns
      .filter(
        (column) =>
          !column.primary &&
          column.isUnique === true,
      )
      .map((column) => column.name);
    const uniqueKeys = config.indexes
      .filter(index=>index.config.unique)
      .map(index=>index.config.columns.map(column=>"name" in column ? column.name : undefined))
      .filter((keys):keys is string[]=>keys.every((key):key is string=>typeof key==="string"));
    return {
      name: config.name,
      columns: config.columns,
      // The outbox key is every primary-key column plus branch_id, so ownership
      // can be checked even when the source row no longer exists.
      keys: primary.includes("branch_id") ? primary : [...primary, "branch_id"],
      cashiersOnly,
      uniqueColumns,
      primaryKeys:primary,
      uniqueKeys:[primary,...uniqueColumns.map(column=>[column]),...uniqueKeys],
      ...(cashiersOnly
        ? { filterColumn: "role", filterValue: "cashier" }
        : {}),
    };
  });
}

export const uploadTables=buildUploadTables(directions);

const uploadTablesByName = new Map(uploadTables.map((table) => [table.name, table]));

/** The upload table with this name, or undefined when it does not upload. */
export function uploadTable(name: string) {
  return uploadTablesByName.get(name);
}

/** Only identifiers that came from the schema are ever used in SQL. */
export function quoteIdentifier(name: string) {
  if (!/^[a-z_]+$/.test(name))
    throw new Error(`Unsafe schema identifier: ${name}`);
  return `\`${name}\``;
}
