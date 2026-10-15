import {
  mysqlTable,
  varchar,
  boolean,
  timestamp,
  foreignKey,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { id, uuidColumn } from "../uuid.js";

export const branches = mysqlTable("branches", {
  id: id().primaryKey(),
  name: varchar("name", { length: 191 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const branchColumn = () =>
  uuidColumn("branch_id")
    .notNull()
    .references(() => branches.id);

export function scopedReference(
  name: string,
  branchId: AnyMySqlColumn,
  local: AnyMySqlColumn,
  foreignBranch: () => AnyMySqlColumn,
  foreignId: () => AnyMySqlColumn,
) {
  return foreignKey({
    name,
    columns: [branchId, local],
    foreignColumns: [foreignBranch(), foreignId()],
  });
}
