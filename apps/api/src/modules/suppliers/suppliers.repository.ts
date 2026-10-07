import {
  branchCondition,
  branchValues,
  branchTransaction,
} from "@cashier/db";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@cashier/db";
import {
  purchaseInvoices,
  supplierPayments,
  suppliers,
} from "@cashier/db";
import type {
  PaymentInput,
  SupplierInput,
  SupplierUpdateInput,
} from "./suppliers.schemas.js";

// balance = opening balance + purchase invoices − payments.
// Qualified names are spelled out because drizzle strips table prefixes
// inside select fields, which breaks the correlated subquery.
const balanceExpr = sql<string>`\`suppliers\`.\`opening_balance\` + COALESCE((
  SELECT SUM(\`pi\`.\`total_amount\`) FROM \`purchase_invoices\` \`pi\`
  WHERE \`pi\`.\`supplier_id\` = \`suppliers\`.\`id\`
), 0) - COALESCE((
  SELECT SUM(\`sp\`.\`amount\`) FROM \`supplier_payments\` \`sp\`
  WHERE \`sp\`.\`supplier_id\` = \`suppliers\`.\`id\`
), 0)`;

const supplierColumns = {
  id: suppliers.id,
  name: suppliers.name,
  phone: suppliers.phone,
  address: suppliers.address,
  notes: suppliers.notes,
  openingBalance: suppliers.openingBalance,
  isActive: suppliers.isActive,
  balance: balanceExpr,
};

export class SuppliersRepository {
  constructor(private db: Db) {}

  transaction<T>(fn: (repo: SuppliersRepository) => Promise<T>): Promise<T> {
    return branchTransaction(this.db, (tx) =>
      fn(new SuppliersRepository(tx as unknown as Db)),
    );
  }

  list() {
    return this.db
      .select(supplierColumns)
      .from(suppliers)
      .where(branchCondition(suppliers))
      .orderBy(suppliers.name);
  }

  async findById(id: string) {
    const [row] = await this.db
      .select(supplierColumns)
      .from(suppliers)
      .where(branchCondition(suppliers, eq(suppliers.id, id)));
    return row;
  }

  async findByIdForUpdate(id: string) {
    const [row] = await this.db
      .select(supplierColumns)
      .from(suppliers)
      .where(branchCondition(suppliers, eq(suppliers.id, id)))
      .for("update");
    return row;
  }

  async hasPayments(supplierId: string) {
    const [row] = await this.db
      .select({ id: supplierPayments.id })
      .from(supplierPayments)
      .where(
        branchCondition(
          supplierPayments,
          eq(supplierPayments.supplierId, supplierId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async hasPurchases(supplierId: string) {
    const [row] = await this.db
      .select({ id: purchaseInvoices.id })
      .from(purchaseInvoices)
      .where(
        branchCondition(
          purchaseInvoices,
          eq(purchaseInvoices.supplierId, supplierId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async create(data: SupplierInput) {
    const [result] = await this.db
      .insert(suppliers)
      .values(
        branchValues({
          ...data,
          openingBalance: data.openingBalance.toFixed(2),
        }),
      ).$returningId();
    return result.id;
  }

  async update(id: string, data: SupplierUpdateInput) {
    const { openingBalance, ...rest } = data;
    const [result] = await this.db
      .update(suppliers)
      .set({
        ...rest,
        ...(openingBalance !== undefined
          ? { openingBalance: openingBalance.toFixed(2) }
          : {}),
      })
      .where(branchCondition(suppliers, eq(suppliers.id, id)));
    return result.affectedRows > 0;
  }

  async deactivate(id: string) {
    const [result] = await this.db
      .update(suppliers)
      .set({ isActive: false })
      .where(
        branchCondition(
          suppliers,
          and(eq(suppliers.id, id), eq(suppliers.isActive, true)),
        ),
      );
    return result.affectedRows > 0;
  }

  async createPayment(supplierId: string, data: PaymentInput) {
    const [result] = await this.db.insert(supplierPayments).values(
      branchValues({
        supplierId,
        amount: data.amount.toFixed(2),
        paidAt: data.paidAt,
        notes: data.notes,
      }),
    ).$returningId();
    return result.id;
  }

  listPayments(supplierId: string) {
    return this.db
      .select()
      .from(supplierPayments)
      .where(
        branchCondition(
          supplierPayments,
          eq(supplierPayments.supplierId, supplierId),
        ),
      )
      .orderBy(supplierPayments.paidAt, supplierPayments.id);
  }

  listPurchases(supplierId: string) {
    return this.db
      .select({
        id: purchaseInvoices.id,
        invoiceNumber: purchaseInvoices.invoiceNumber,
        purchasedAt: purchaseInvoices.purchasedAt,
        totalAmount: purchaseInvoices.totalAmount,
      })
      .from(purchaseInvoices)
      .where(
        branchCondition(
          purchaseInvoices,
          eq(purchaseInvoices.supplierId, supplierId),
        ),
      )
      .orderBy(purchaseInvoices.purchasedAt, purchaseInvoices.id);
  }
}
