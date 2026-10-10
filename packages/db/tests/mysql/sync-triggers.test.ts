import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { is } from "drizzle-orm";
import { getTableConfig, MySqlTable } from "drizzle-orm/mysql-core";
import * as schema from "../../src/schema.js";
import { generateSyncTriggers } from "../../scripts/generate-sync-triggers.js";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { closeDb, createDb } from "../../src/client.js";
import { loadTestEnvironment, migrationsFolder } from "../support/test-env.js";

const name = `cashier_outbox_${randomUUID().replaceAll("-", "")}_test`;
const branch = "00000000-0000-7000-8000-000000000001";
const employee = "00000000-0000-7000-8000-000000000002";
let connection: Connection;
let owned = false;
let url: string;
beforeAll(async () => {
  const target = new URL(loadTestEnvironment());
  if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname))
    throw new Error("Outbox verification requires local MySQL");
  target.pathname = "/";
  connection = await mysql.createConnection({
    uri: target.toString(),
    dateStrings: true,
  });
  await connection.query("CREATE DATABASE ??", [name]);
  owned = true;
  await connection.changeUser({ database: name });
  await connection.query("SET time_zone = '+00:00'");
  target.pathname = `/${name}`;
  url = target.toString();
  const db = createDb(url);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await closeDb(db);
  }
  await connection.query("INSERT INTO branches (id,name) VALUES (?, 'Shop')", [
    branch,
  ]);
});
beforeEach(async () => {
  await connection.query("SET @cashier_sync_apply = 1");
  await connection.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    for (const table of [
      "users",
      "employees",
      "external_categories",
      "suppliers",
      "sync_outbox",
    ])
      await connection.query("DELETE FROM ??", [table]);
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    await connection.query("SET @cashier_sync_apply = NULL");
  }
});
afterAll(async () => {
  if (!connection) return;
  try {
    if (owned) await connection.query("DROP DATABASE ??", [name]);
  } finally {
    await connection.end();
  }
});
async function rows() {
  const [result] = await connection.query<RowDataPacket[]>(
    "SELECT * FROM sync_outbox ORDER BY seq",
  );
  return result;
}
async function insertEmployee(
  client = connection,
  id = employee,
  label = "أحمد",
) {
  await client.query(
    "INSERT INTO employees (branch_id,id,name,hire_date,pay_rate,notes,created_at) VALUES (?,?,?,'2026-10-09','123.45',?, '2026-10-09 12:34:56')",
    [branch, id, label, 'quote " and \\ slash'],
  );
}
it("captures insert, full updated row and branch-scoped delete without losing nulls or money", async () => {
  await insertEmployee();
  await connection.query(
    "UPDATE employees SET name='Changed', pay_rate=NULL WHERE id=?",
    [employee],
  );
  await connection.query("DELETE FROM employees WHERE id=?", [employee]);
  const result = await rows();
  expect(result).toHaveLength(3);
  expect(result.map((row) => row.op)).toEqual(["upsert", "upsert", "delete"]);
  expect(result[0].pk).toEqual({ id: employee, branch_id: branch });
  expect(result[0].row_json).toEqual({
    id: employee,
    branch_id: branch,
    name: "أحمد",
    phone: null,
    job_title: null,
    hire_date: "2026-10-09",
    pay_rate: "123.45",
    notes: 'quote " and \\ slash',
    is_active: 1,
    created_at: "2026-10-09 12:34:56",
  });
  expect(result[1].row_json).toMatchObject({ name: "Changed", pay_rate: null });
  expect(result[2]).toMatchObject({
    pk: { id: employee, branch_id: branch },
    row_json: null,
  });
});
it("captures composite external keys, including a tombstone when the key changes", async () => {
  await connection.query(
    "INSERT INTO external_categories (branch_id,external_id,name_ar,name_en,is_active,is_visible,display_order,synced_at) VALUES (?,7,'Food','Food',1,1,0,'2026-10-09 12:34:56')",
    [branch],
  );
  await connection.query(
    "UPDATE external_categories SET external_id=8 WHERE external_id=7",
  );
  await connection.query("DELETE FROM external_categories");
  const result = await rows();
  expect(result.map((row) => [row.op, row.pk])).toEqual([
    ["upsert", { branch_id: branch, external_id: 7 }],
    ["delete", { branch_id: branch, external_id: 7 }],
    ["upsert", { branch_id: branch, external_id: 8 }],
    ["delete", { branch_id: branch, external_id: 8 }],
  ]);
});
it("uploads cashiers and their password hashes but never online admins", async () => {
  await connection.query(
    "INSERT INTO users (id,name,username,password_hash,role) VALUES (?, 'Admin','admin','secret-admin','admin')",
    [randomUUID()],
  );
  const id = randomUUID();
  await connection.query(
    "INSERT INTO users (id,branch_id,name,username,password_hash,role) VALUES (?,?,'Cashier','cashier','secret-cashier','cashier')",
    [id, branch],
  );
  await connection.query("UPDATE users SET token_version=2 WHERE id=?", [id]);
  await connection.query("DELETE FROM users WHERE id=?", [id]);
  const result = await rows();
  expect(result).toHaveLength(3);
  expect(result[0].row_json).toMatchObject({
    role: "cashier",
    password_hash: "secret-cashier",
  });
  expect(result[1].row_json.token_version).toBe(2);
  expect(result[2].pk).toEqual({ id, branch_id: branch });
});
it("suppresses every mutation on an apply connection and resumes after reset", async () => {
  await connection.query("SET @cashier_sync_apply = 1");
  await insertEmployee();
  await connection.query("UPDATE employees SET name='Applied'");
  await connection.query("DELETE FROM employees");
  expect(await rows()).toEqual([]);
  await connection.query("SET @cashier_sync_apply = 0");
  await insertEmployee();
  expect(await rows()).toHaveLength(1);
});
it("rolls back the outbox together with business data", async () => {
  await connection.beginTransaction();
  try {
    await insertEmployee();
    expect(await rows()).toHaveLength(1);
    await connection.rollback();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
  expect(await rows()).toEqual([]);
  const [data] = await connection.query<RowDataPacket[]>(
    "SELECT * FROM employees",
  );
  expect(data).toEqual([]);
});
const plan = fs.readFileSync(
  path.resolve(import.meta.dirname, "../../../../docs/desktop-online-plan.md"),
  "utf8",
);
const directionRows = plan
  .slice(plan.indexOf("### 7.1"), plan.indexOf("### 7.2"))
  .split("\n");
const upNames = directionRows
  .filter((line) => /^\| Up\s*\|/.test(line))
  .flatMap((line) =>
    [...line.matchAll(/`([a-z_]+)`/g)].map((match) => match[1]),
  );
const tables = Object.values(schema)
  .filter((table) => is(table, MySqlTable))
  .map(getTableConfig);
it("installs exactly three capture triggers for every upload table and none for other directions", async () => {
  const classified = directionRows
    .filter((line) => /^\| (Up|Down|None)/.test(line))
    .flatMap((line) =>
      [...line.matchAll(/`([a-z_]+)`/g)].map((match) => match[1]),
    );
  expect(
    tables
      .map((table) => table.name)
      .filter((name) => !classified.includes(name)),
  ).toEqual([]);
  const [triggers] = await connection.query<RowDataPacket[]>(
    "SELECT EVENT_OBJECT_TABLE AS name, EVENT_MANIPULATION AS event, ACTION_TIMING AS timing FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=?",
    [name],
  );
  const expected = [...upNames, "users"].flatMap((name) =>
    ["INSERT", "UPDATE", "DELETE"].map((event) => ({
      name,
      event,
      timing: "AFTER",
    })),
  );
  const sort = (entries: Record<string, unknown>[]) =>
    entries.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  expect(sort(triggers)).toEqual(sort(expected));
});
it("executes insert/update/delete and apply suppression on every upload table with all its columns", async () => {
  // Coverage fixtures deliberately bypass unrelated FK/check rules. Business
  // validation is covered by the API suite; this exercises every installed trigger.
  await connection.query("SET FOREIGN_KEY_CHECKS=0");
  for (const table of tables.filter((table) => upNames.includes(table.name)))
    for (const check of table.checks)
      await connection.query("ALTER TABLE ?? ALTER CHECK ?? NOT ENFORCED", [
        table.name,
        check.name,
      ]);
  try {
    for (const table of tables.filter((table) =>
      upNames.includes(table.name),
    )) {
      const values = table.columns.map((column) => {
        const type = column.getSQLType();
        if (column.name === "branch_id") return branch;
        if (!column.notNull && !column.primary) return null;
        if (type.startsWith("char(36)")) return randomUUID();
        if (column.enumValues?.length) return column.enumValues[0];
        if (/^(timestamp|datetime)/.test(type)) return "2026-10-09 12:34:56";
        if (type === "date") return "2026-10-09";
        if (type.startsWith("decimal(30,"))
          return "1234567890123456789012345678.90";
        if (type.startsWith("decimal")) return "12.34";
        if (/^(int|tinyint|bigint|smallint|boolean)/.test(type)) return 1;
        return "fixture";
      });
      await connection.query("SET @cashier_sync_apply=1");
      await connection.query("DELETE FROM ??", [table.name]);
      await connection.query("DELETE FROM sync_outbox");
      await connection.query("SET @cashier_sync_apply=0");
      const insert = `INSERT INTO \`${table.name}\` (${table.columns.map((column) => `\`${column.name}\``).join(",")}) VALUES (${values.map(() => "?").join(",")})`;
      await connection.query(insert, values);
      const [stored] = await connection.query<RowDataPacket[]>(
        "SELECT * FROM ??",
        [table.name],
      );
      expect((await rows())[0]?.row_json, table.name).toEqual({ ...stored[0] });
      await connection.query(
        `UPDATE \`${table.name}\` SET branch_id=branch_id`,
      );
      await connection.query("DELETE FROM ??", [table.name]);
      expect(
        (await rows()).map((row) => row.op),
        table.name,
      ).toEqual(["upsert", "upsert", "delete"]);
      await connection.query("DELETE FROM sync_outbox");
      await connection.query("SET @cashier_sync_apply=1");
      await connection.query(insert, values);
      await connection.query(
        `UPDATE \`${table.name}\` SET branch_id=branch_id`,
      );
      await connection.query("DELETE FROM ??", [table.name]);
      expect(await rows(), table.name).toEqual([]);
    }
  } finally {
    for (const table of tables.filter((table) => upNames.includes(table.name)))
      for (const check of table.checks)
        await connection.query("ALTER TABLE ?? ALTER CHECK ?? ENFORCED", [
          table.name,
          check.name,
        ]);
    await connection.query("SET FOREIGN_KEY_CHECKS=1");
    await connection.query("SET @cashier_sync_apply=NULL");
  }
});
it("retains a late lower sequence after acknowledging the earlier visible batch", async () => {
  const late = await mysql.createConnection(url);
  try {
    await late.beginTransaction();
    await insertEmployee(late);
    await connection.query(
      "INSERT INTO suppliers (branch_id,id,name) VALUES (?,?,'Visible')",
      [branch, randomUUID()],
    );
    const batch = await rows();
    expect(batch).toHaveLength(1);
    expect(batch[0].table_name).toBe("suppliers");
    // The approved contract deletes only the exact acknowledged set.
    await connection.query("DELETE FROM sync_outbox WHERE seq IN (?)", [
      batch.map((row) => row.seq),
    ]);
    await late.commit();
    const remaining = await rows();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].table_name).toBe("employees");
    expect(remaining[0].seq).toBeLessThan(batch[0].seq);
  } finally {
    await late.rollback();
    await late.end();
  }
});
it("removes former cashier backup rows without uploading admin credentials", async () => {
  const id = randomUUID();
  await connection.query(
    "INSERT INTO users (id,branch_id,name,username,password_hash,role) VALUES (?,?,'Person','person','cashier-hash','cashier')",
    [id, branch],
  );
  await connection.query(
    "UPDATE users SET role='admin',branch_id=NULL,password_hash='admin-hash' WHERE id=?",
    [id],
  );
  await connection.query(
    "UPDATE users SET role='cashier',branch_id=?,password_hash='new-cashier-hash' WHERE id=?",
    [branch, id],
  );
  const result = await rows();
  expect(result.map((row) => row.op)).toEqual(["upsert", "delete", "upsert"]);
  expect(result[1]).toMatchObject({
    pk: { id, branch_id: branch },
    row_json: null,
  });
  expect(result[2].row_json.password_hash).toBe("new-cashier-hash");
  expect(
    result.some((row) => row.row_json?.password_hash === "admin-hash"),
  ).toBe(false);
});
it("keeps apply suppression connection-local", async () => {
  const other = await mysql.createConnection(url);
  try {
    await connection.query("SET @cashier_sync_apply=1");
    await insertEmployee();
    const id = randomUUID();
    await insertEmployee(other, id, "Other writer");
    const result = await rows();
    expect(result).toHaveLength(1);
    expect(result[0].pk).toEqual({ id, branch_id: branch });
  } finally {
    await other.end();
  }
});
it("removes old capture triggers when a table stops uploading", async () => {
  const changed = plan
    .replace("`employees`, ", "")
    .replace(
      "`external_catalog_sync` (local worker bookkeeping)",
      "`employees`, `external_catalog_sync` (local worker bookkeeping)",
    );
  const apply = async (sql: string) => {
    for (const statement of sql.split("--> statement-breakpoint"))
      if (statement.trim()) await connection.query(statement);
  };
  try {
    await apply(generateSyncTriggers(changed));
    await insertEmployee();
    expect(await rows()).toEqual([]);
  } finally {
    await apply(generateSyncTriggers(plan));
  }
});
