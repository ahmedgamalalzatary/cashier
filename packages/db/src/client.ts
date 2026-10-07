import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema.js";

export function createDb(url: string) {
  // Drizzle serializes timestamp columns as UTC. Raw-query parameters and
  // results must use the same timezone, regardless of the host's timezone.
  const pool = mysql.createPool({ uri: url, timezone: "Z" });
  pool.pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'");
  });
  return drizzle(pool, { schema, mode: "default" });
}

export type Db = ReturnType<typeof createDb>;

export function closeDb(db: Db) {
  return db.$client.end();
}
