// Tables per docs/system-specs.md §15 — added incrementally per feature
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
  type AnyMySqlColumn,
} from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 191 }).notNull(),
  username: varchar('username', { length: 100 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: mysqlEnum('role', ['admin', 'cashier']).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// two levels only: main (parentId null) → sub (parentId = a main category)
export const categories = mysqlTable('categories', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 191 }).notNull(),
  parentId: int('parent_id').references((): AnyMySqlColumn => categories.id),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const suppliers = mysqlTable('suppliers', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 191 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  address: varchar('address', { length: 255 }),
  notes: text('notes'),
  openingBalance: decimal('opening_balance', { precision: 12, scale: 2 }).notNull().default('0'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const supplierPayments = mysqlTable('supplier_payments', {
  id: int('id').autoincrement().primaryKey(),
  supplierId: int('supplier_id')
    .notNull()
    .references(() => suppliers.id),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  paidAt: date('paid_at', { mode: 'string' }).notNull(),
  notes: varchar('notes', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
