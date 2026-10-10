import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { is } from "drizzle-orm";
import {
  getTableConfig,
  MySqlTable,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import * as schema from "../src/schema.js";

export function readSyncDirections(plan: string) {
  const section = plan.slice(plan.indexOf("### 7.1"), plan.indexOf("### 7.2"));
  const directions = new Map<string, Set<string>>();
  for (const line of section.split("\n")) {
    const direction = /^\| (Up \(filtered\)|Up|Down|None)\s*\|/.exec(line)?.[1];
    if (!direction) continue;
    if (
      direction === "Up (filtered)" &&
      !line.includes("`role = 'cashier'` only")
    )
      throw new Error("Unsupported upload filter in the direction contract");
    for (const match of line.matchAll(/`([a-z_]+)`/g)) {
      const assigned = directions.get(match[1]) ?? new Set<string>();
      if (assigned.has(direction))
        throw new Error(`Duplicate sync direction: ${match[1]}`);
      assigned.add(direction);
      directions.set(match[1], assigned);
    }
  }
  return directions;
}

export function generateSyncTriggers(plan: string): string {
  const directions=readSyncDirections(plan);
  const tables = Object.values(schema)
    .filter((table) => is(table, MySqlTable))
    .map(getTableConfig);
  for (const table of tables) {
    const assigned = directions.get(table.name);
    if (
      !assigned ||
      (assigned.size !== 1 &&
        !(
          table.name === "users" &&
          assigned.size === 2 &&
          assigned.has("Up (filtered)") &&
          assigned.has("Down")
        ))
    )
      throw new Error(`Missing or conflicting sync direction: ${table.name}`);
    if (assigned.has("Up (filtered)") && table.name !== "users")
      throw new Error(`Unsupported upload filter: ${table.name}`);
  }
  for (const name of directions.keys())
    if (
      name !== "__drizzle_migrations" &&
      !tables.some((table) => table.name === name)
    )
      throw new Error(`Unknown sync table: ${name}`);
  const statements: string[] = [];
  const quote = (name: string) => {
    if (!/^[a-z_]+$/.test(name))
      throw new Error(`Unsafe schema identifier: ${name}`);
    return `\`${name}\``;
  };
  const json = (
    columns: AnyMySqlColumn[],
    source: "NEW" | "OLD",
    preserveDecimals = false,
  ) =>
    `JSON_OBJECT(${columns
      .map((column) => {
        const value = `${source}.${quote(column.name)}`;
        return `'${column.name}', ${preserveDecimals && /^(decimal|timestamp|datetime)/.test(column.getSQLType()) ? `CAST(${value} AS CHAR)` : value}`;
      })
      .join(", ")})`;
  for (const table of tables) {
    const assigned = directions.get(table.name)!;
    if (!assigned.has("Up") && !assigned.has("Up (filtered)")) {
      for (const event of ["insert", "update", "delete"])
        statements.push(
          `DROP TRIGGER IF EXISTS ${quote(`cashier_sync_${table.name}_${event}`)};`,
        );
    }
    if (!assigned.has("Up") && !assigned.has("Up (filtered)")) continue;
    const keys = table.primaryKeys.length
      ? table.primaryKeys[0].columns
      : table.columns.filter((column) => column.primary);
    const branch = table.columns.find((column) => column.name === "branch_id");
    if (!keys.length || !branch)
      throw new Error(
        `Upload table needs a primary key and branch_id: ${table.name}`,
      );
    const identity = [...keys];
    if (!identity.includes(branch)) identity.push(branch);
    const filtered = assigned.has("Up (filtered)");
    const eligible = (source: "NEW" | "OLD") =>
      filtered ? `${source}.\`role\` = 'cashier'` : "TRUE";
    const insert = (source: "NEW" | "OLD", op: "upsert" | "delete") =>
      `INSERT INTO \`sync_outbox\` (\`table_name\`, \`op\`, \`pk\`, \`row_json\`) VALUES ('${table.name}', '${op}', ${json(identity, source)}, ${op === "delete" ? "NULL" : json(table.columns, source, true)});`;
    const changed = identity
      .map(
        (column) =>
          `NOT (OLD.${quote(column.name)} <=> NEW.${quote(column.name)})`,
      )
      .join(" OR ");
    for (const event of ["INSERT", "UPDATE", "DELETE"] as const) {
      const trigger = `cashier_sync_${table.name}_${event.toLowerCase()}`;
      let body: string;
      if (event === "UPDATE")
        body = `IF ${eligible("OLD")} AND (${changed}${filtered ? " OR NEW.`role` <> 'cashier'" : ""}) THEN\n      ${insert("OLD", "delete")}\n    END IF;\n    IF ${eligible("NEW")} THEN\n      ${insert("NEW", "upsert")}\n    END IF;`;
      else {
        const source = event === "DELETE" ? "OLD" : "NEW";
        body = `IF ${eligible(source)} THEN\n      ${insert(source, event === "DELETE" ? "delete" : "upsert")}\n    END IF;`;
      }
      statements.push(`DROP TRIGGER IF EXISTS ${quote(trigger)};`);
      statements.push(
        `CREATE TRIGGER ${quote(trigger)} AFTER ${event} ON ${quote(table.name)} FOR EACH ROW\nBEGIN\n  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN\n    ${body}\n  END IF;\nEND;`,
      );
    }
  }
  return statements.join("\n--> statement-breakpoint\n") + "\n";
}

export function writeTriggerMigration(directory: string, plan: string) {
  const generated = generateSyncTriggers(plan);
  const journalPath = path.join(directory, "meta/_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
    entries: Array<{ tag: string }>;
  };
  const previous = [...journal.entries]
    .reverse()
    .find((entry) => entry.tag.endsWith("_sync_triggers"));
  if (
    previous &&
    fs
      .readFileSync(path.join(directory, `${previous.tag}.sql`), "utf8")
      .replaceAll("\r\n", "\n") === generated
  )
    return null;
  const result = spawnSync(
    process.execPath,
    [
      path.resolve(import.meta.dirname, "../node_modules/drizzle-kit/bin.cjs"),
      "generate",
      "--custom",
      "--name=sync_triggers",
      "--dialect=mysql",
      `--schema=${path.resolve(import.meta.dirname, "../src/schema.ts").replaceAll("\\", "/")}`,
      `--out=${path.basename(directory)}`,
    ],
    { cwd: path.dirname(directory), encoding: "utf8", windowsHide: true },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  const next = JSON.parse(
    fs.readFileSync(journalPath, "utf8"),
  ) as typeof journal;
  if (next.entries.length !== journal.entries.length + 1)
    throw new Error(
      `Drizzle did not create one new custom migration: ${result.stdout} ${result.stderr}; node=${process.execPath}, out=${path.relative(process.cwd(), directory)}`,
    );
  const file = path.join(directory, `${next.entries.at(-1)!.tag}.sql`);
  fs.writeFileSync(file, generated);
  return file;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
) {
  const directory = path.resolve(
    process.argv.find((arg) => arg.startsWith("--out="))?.slice(6) ?? "drizzle",
  );
  const planPath = path.resolve(
    process.argv.find((arg) => arg.startsWith("--plan="))?.slice(7) ??
      "../../docs/desktop-online-plan.md",
  );
  const plan=fs.readFileSync(planPath,"utf8");
  console.log(
    writeTriggerMigration(directory, plan) ??
      "Sync triggers are current; no migration written.",
  );
  const file=path.resolve(import.meta.dirname,"../src/sync-directions.json");
  const data=JSON.stringify(Object.fromEntries([...readSyncDirections(plan)].map(([name,directions])=>[name,[...directions]])),null,2)+"\n";
  if(!fs.existsSync(file)||fs.readFileSync(file,"utf8")!==data) fs.writeFileSync(file,data);
}
