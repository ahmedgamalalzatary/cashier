import { eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/index.js';
import { supplierPayments, suppliers } from '../../db/schema.js';
import type {
  PaymentInput,
  SupplierInput,
  SupplierUpdateInput,
} from './suppliers.schemas.js';

// balance = opening balance + purchase credit (later) − payments.
// Qualified names are spelled out because drizzle strips table prefixes
// inside select fields, which breaks the correlated subquery.
const balanceExpr = sql<string>`\`suppliers\`.\`opening_balance\` - COALESCE((
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
    return this.db.transaction((tx) =>
      fn(new SuppliersRepository(tx as unknown as Db)),
    );
  }

  list() {
    return this.db
      .select(supplierColumns)
      .from(suppliers)
      .orderBy(suppliers.name);
  }

  async findById(id: number) {
    const [row] = await this.db
      .select(supplierColumns)
      .from(suppliers)
      .where(eq(suppliers.id, id));
    return row;
  }

  async findByIdForUpdate(id: number) {
    const [row] = await this.db
      .select(supplierColumns)
      .from(suppliers)
      .where(eq(suppliers.id, id))
      .for('update');
    return row;
  }

  async hasPayments(supplierId: number) {
    const [row] = await this.db
      .select({ id: supplierPayments.id })
      .from(supplierPayments)
      .where(eq(supplierPayments.supplierId, supplierId))
      .limit(1);
    return Boolean(row);
  }

  async create(data: SupplierInput) {
    const [result] = await this.db
      .insert(suppliers)
      .values({ ...data, openingBalance: data.openingBalance.toFixed(2) });
    return result.insertId;
  }

  async update(id: number, data: SupplierUpdateInput) {
    const { openingBalance, ...rest } = data;
    const [result] = await this.db
      .update(suppliers)
      .set({
        ...rest,
        ...(openingBalance !== undefined
          ? { openingBalance: openingBalance.toFixed(2) }
          : {}),
      })
      .where(eq(suppliers.id, id));
    return result.affectedRows > 0;
  }

  async deactivate(id: number) {
    const [result] = await this.db
      .update(suppliers)
      .set({ isActive: false })
      .where(eq(suppliers.id, id));
    return result.affectedRows > 0;
  }

  async createPayment(supplierId: number, data: PaymentInput) {
    const [result] = await this.db.insert(supplierPayments).values({
      supplierId,
      amount: data.amount.toFixed(2),
      paidAt: data.paidAt,
      notes: data.notes,
    });
    return result.insertId;
  }

  listPayments(supplierId: number) {
    return this.db
      .select()
      .from(supplierPayments)
      .where(eq(supplierPayments.supplierId, supplierId))
      .orderBy(supplierPayments.paidAt, supplierPayments.id);
  }
}
