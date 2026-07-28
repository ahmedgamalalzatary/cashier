import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/index.js';
import {
  items,
  products,
  categoryColors,
  categorySizes,
  purchaseInvoices,
  purchaseLines,
  supplierPayments,
  suppliers,
  users,
} from '../../db/schema.js';
import { InventoryRepository } from '../inventory/inventory.repository.js';
import { InventoryTransaction } from '../inventory/inventory.service.js';

export type PurchaseLineWrite = {
  invoiceId: number;
  itemId: number;
  quantity: string;
  unitPrice: string;
  unitCost: string;
  lineTotal: string;
};

export class PurchasesRepository {
  constructor(private db: Db) {}

  transaction<T>(
    fn: (
      repo: PurchasesRepository,
      inventory: InventoryTransaction,
    ) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction((tx) => {
      const transactionDb = tx as unknown as Db;
      return fn(
        new PurchasesRepository(transactionDb),
        new InventoryTransaction(new InventoryRepository(transactionDb)),
      );
    });
  }

  async findSupplierForUpdate(id: number) {
    const [row] = await this.db
      .select({ id: suppliers.id, isActive: suppliers.isActive })
      .from(suppliers)
      .where(eq(suppliers.id, id))
      .for('update');
    return row;
  }

  lockItems(ids: number[]) {
    return this.db
      .select({
        id: items.id,
        isActive: items.isActive,
        productIsActive: products.isActive,
      })
      .from(items)
      .innerJoin(products, eq(items.productId, products.id))
      .where(
        inArray(
          items.id,
          [...ids].sort((a, b) => a - b),
        ),
      )
      .orderBy(asc(items.id))
      .for('update');
  }

  async hasInvoiceNumber(supplierId: number, invoiceNumber: string) {
    const [row] = await this.db
      .select({ id: purchaseInvoices.id })
      .from(purchaseInvoices)
      .where(
        and(
          eq(purchaseInvoices.supplierId, supplierId),
          eq(purchaseInvoices.invoiceNumber, invoiceNumber),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async createInvoice(data: {
    supplierId: number;
    invoiceNumber: string | null;
    purchasedAt: string;
    notes: string | null;
    totalAmount: string;
    paidAmount: string;
    createdBy: number;
  }) {
    const [result] = await this.db.insert(purchaseInvoices).values(data);
    return result.insertId;
  }

  async createLine(data: PurchaseLineWrite) {
    await this.db.insert(purchaseLines).values(data);
  }

  async createPayment(data: {
    supplierId: number;
    purchaseInvoiceId: number;
    amount: string;
    paidAt: string;
  }) {
    await this.db.insert(supplierPayments).values(data);
  }

  list() {
    return this.db
      .select({
        id: purchaseInvoices.id,
        supplierId: purchaseInvoices.supplierId,
        supplierName: suppliers.name,
        invoiceNumber: purchaseInvoices.invoiceNumber,
        purchasedAt: purchaseInvoices.purchasedAt,
        notes: purchaseInvoices.notes,
        totalAmount: purchaseInvoices.totalAmount,
        paidAmount: purchaseInvoices.paidAmount,
        dueAmount: sql<string>`CAST(${purchaseInvoices.totalAmount} - ${purchaseInvoices.paidAmount} AS DECIMAL(12,2))`,
        createdBy: purchaseInvoices.createdBy,
        createdByName: users.name,
        createdAt: purchaseInvoices.createdAt,
      })
      .from(purchaseInvoices)
      .innerJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
      .innerJoin(users, eq(purchaseInvoices.createdBy, users.id))
      .orderBy(desc(purchaseInvoices.purchasedAt), desc(purchaseInvoices.id));
  }

  async findById(id: number) {
    const [row] = await this.db
      .select({
        id: purchaseInvoices.id,
        supplierId: purchaseInvoices.supplierId,
        supplierName: suppliers.name,
        invoiceNumber: purchaseInvoices.invoiceNumber,
        purchasedAt: purchaseInvoices.purchasedAt,
        notes: purchaseInvoices.notes,
        totalAmount: purchaseInvoices.totalAmount,
        paidAmount: purchaseInvoices.paidAmount,
        dueAmount: sql<string>`CAST(${purchaseInvoices.totalAmount} - ${purchaseInvoices.paidAmount} AS DECIMAL(12,2))`,
        createdBy: purchaseInvoices.createdBy,
        createdByName: users.name,
        createdAt: purchaseInvoices.createdAt,
      })
      .from(purchaseInvoices)
      .innerJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
      .innerJoin(users, eq(purchaseInvoices.createdBy, users.id))
      .where(eq(purchaseInvoices.id, id));
    return row;
  }

  async listLines(invoiceId: number) {
    const rows = await this.db
      .select({
        id: purchaseLines.id,
        variantId: purchaseLines.itemId,
        itemId: purchaseLines.itemId,
        variantCode: items.code,
        itemCode: items.code,
        barcode: items.barcode,
        productName: products.name,
        itemName: sql<string>`CONCAT(${products.name}, ' - ', ${categoryColors.name}, ' - ', ${categorySizes.name})`,
        colorName: categoryColors.name,
        sizeName: categorySizes.name,
        quantity: purchaseLines.quantity,
        stockQuantity: purchaseLines.quantity,
        stockUnit: sql<"قطعة">`'قطعة'`,
        unitPrice: purchaseLines.unitPrice,
        unitCost: purchaseLines.unitCost,
        lineTotal: purchaseLines.lineTotal,
      })
      .from(purchaseLines)
      .innerJoin(items, eq(purchaseLines.itemId, items.id))
      .innerJoin(products, eq(items.productId, products.id))
      .innerJoin(categoryColors, eq(items.colorId, categoryColors.id))
      .innerJoin(categorySizes, eq(items.sizeId, categorySizes.id))
      .where(eq(purchaseLines.invoiceId, invoiceId))
      .orderBy(purchaseLines.id);
    return rows;
  }
}
