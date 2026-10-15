import {
  mysqlTable,
  varchar,
  int,
  decimal,
  boolean,
  timestamp,
  date,
  text,
  mysqlEnum,
  index,
  uniqueIndex,
  primaryKey,
  type AnyMySqlColumn,
  check,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { id, uuidColumn } from "../uuid.js";
import { branchColumn, branches, scopedReference } from "./base.js";

export const employees = mysqlTable(
  "employees",
  {
    branchId: branchColumn(),
    id: id().primaryKey(),
    name: varchar("name", { length: 191 }).notNull(),
    phone: varchar("phone", { length: 50 }),
    jobTitle: varchar("job_title", { length: 100 }),
    hireDate: date("hire_date", { mode: "string" }),
    /** monthly salary — null means the salary was never set */
    payRate: decimal("pay_rate", { precision: 12, scale: 2 }),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("employees_branch_id_uidx").on(table.branchId, table.id),
  ],
);

export const users = mysqlTable(
  "users",
  {
    id: id().primaryKey(),
    branchId: uuidColumn("branch_id").references(() => branches.id),
    employeeId: uuidColumn("employee_id").references(() => employees.id),
    name: varchar("name", { length: 191 }).notNull(),
    username: varchar("username", { length: 100 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    tokenVersion: int("token_version").notNull().default(0),
    role: mysqlEnum("role", ["admin", "cashier"]).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_branch_id_uidx").on(table.branchId, table.id),
    scopedReference(
      "users_employeeId_br_fk",
      table.branchId,
      table.employeeId,
      (): AnyMySqlColumn => employees.branchId,
      (): AnyMySqlColumn => employees.id,
    ),
    uniqueIndex("users_employee_id_uidx").on(table.employeeId),
    uniqueIndex("users_cashier_username_branch_uidx").on(
      table.role,
      table.branchId,
      table.username,
    ),
    // Nullable branches cannot enforce admin uniqueness in a composite index.
    // A functional index protects admins without adding generated sync columns.
    uniqueIndex("users_admin_username_uidx").on(
      sql`(CASE WHEN \`role\` = 'admin' THEN \`username\` ELSE NULL END)`,
    ),
    check(
      "users_role_branch_chk",
      sql`(${table.role} = 'admin' AND ${table.branchId} IS NULL) OR (${table.role} = 'cashier' AND ${table.branchId} IS NOT NULL)`,
    ),
  ],
);

export const adminBranches = mysqlTable(
  "admin_branches",
  {
    adminUserId: uuidColumn("admin_user_id")
      .notNull()
      .references(() => users.id),
    branchId: branchColumn(),
  },
  (table) => [
    primaryKey({ columns: [table.adminUserId, table.branchId] }),
    index("admin_branches_branch_idx").on(table.branchId),
  ],
);
