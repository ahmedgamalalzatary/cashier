import {
  branchCondition,
  branchValues,
  branchTable,
  branchTransaction,
} from "@cashier/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import type { Db } from "@cashier/db";
import {
  items,
  purchaseInvoices,
  purchaseLines,
  shifts,
  transferLines,
  transferRequestLines,
  transferRequests,
  transfers,
  users,
} from "@cashier/db";
import { InventoryRepository } from "../inventory/inventory.repository.js";
import { InventoryTransaction } from "../inventory/inventory.service.js";

const requester = alias(users, "transfer_requester");
const reviewer = alias(users, "transfer_reviewer");
const transferCreator = alias(users, "transfer_creator");
const transferApprover = alias(users, "transfer_approver");

export class TransfersRepository {
  constructor(private db: Db) {}

  transaction<T>(
    fn: (
      repo: TransfersRepository,
      inventory: InventoryTransaction,
    ) => Promise<T>,
  ): Promise<T> {
    return branchTransaction(this.db, (tx) => {
      const transactionDb = tx as unknown as Db;
      return fn(
        new TransfersRepository(transactionDb),
        new InventoryTransaction(new InventoryRepository(transactionDb)),
      );
    });
  }

  lockItems(ids: number[]) {
    return this.db
      .select({ id: items.id, name: items.name, isActive: items.isActive })
      .from(items)
      .where(
        branchCondition(
          items,
          inArray(
            items.id,
            [...ids].sort((a, b) => a - b),
          ),
        ),
      )
      .orderBy(asc(items.id))
      .for("update");
  }

  /** Locks the invoice row so two transfers of the same invoice serialise. */
  async lockPurchaseInvoice(invoiceId: number) {
    const [row] = await this.db
      .select({ id: purchaseInvoices.id })
      .from(purchaseInvoices)
      .where(
        branchCondition(purchaseInvoices, eq(purchaseInvoices.id, invoiceId)),
      )
      .for("update");
    return row;
  }

  /** Stock quantity the invoice bought, per item, in thousandths. */
  async purchaseInvoiceQuantities(invoiceId: number) {
    const rows = await this.db
      .select({
        itemId: purchaseLines.itemId,
        milli: sql<string>`CAST(SUM(CAST(${purchaseLines.stockQuantity} * 1000 AS SIGNED)) AS CHAR)`,
      })
      .from(purchaseLines)
      .where(
        branchCondition(purchaseLines, eq(purchaseLines.invoiceId, invoiceId)),
      )
      .groupBy(purchaseLines.itemId);
    return new Map(rows.map((row) => [row.itemId, Number(row.milli)]));
  }

  /** Quantity of that invoice already sent to the cafe, per item, in thousandths. */
  async purchaseInvoiceTransferredMilli(invoiceId: number) {
    const rows = await this.db
      .select({
        itemId: transferLines.itemId,
        milli: sql<string>`CAST(SUM(CAST(${transferLines.quantity} * 1000 AS SIGNED)) AS CHAR)`,
      })
      .from(transferLines)
      .innerJoin(transfers, eq(transferLines.transferId, transfers.id))
      .where(eq(transfers.purchaseInvoiceId, invoiceId))
      .groupBy(transferLines.itemId);
    return new Map(rows.map((row) => [row.itemId, Number(row.milli)]));
  }

  async findOpenShiftForCashier(cashierUserId: number) {
    const [row] = await this.db
      .select({ id: shifts.id })
      .from(shifts)
      .where(
        branchCondition(
          shifts,
          and(eq(shifts.openSlot, 1), eq(shifts.cashierUserId, cashierUserId)),
        ),
      )
      .for("update");
    return row;
  }

  async createRequest(data: {
    requestedBy: number;
    shiftId: number | null;
    notes: string | null;
    clientRequestId: string;
    requestFingerprint: string;
  }) {
    const [result] = await this.db
      .insert(transferRequests)
      .values(branchValues(data));
    return result.insertId;
  }

  async findRequestByClientRequestId(clientRequestId: string) {
    const [row] = await this.db
      .select({
        id: transferRequests.id,
        requestedBy: transferRequests.requestedBy,
        requestFingerprint: transferRequests.requestFingerprint,
      })
      .from(transferRequests)
      .where(
        branchCondition(
          transferRequests,
          eq(transferRequests.clientRequestId, clientRequestId),
        ),
      );
    return row;
  }

  async createRequestLine(data: {
    requestId: number;
    itemId: number;
    quantity: string;
  }) {
    await this.db.insert(transferRequestLines).values(branchValues(data));
  }

  listRequests() {
    const lineCount = sql<number>`(
      SELECT COUNT(*)
      FROM ${branchTable("transfer_request_lines")} trl
      WHERE trl.request_id = ${transferRequests.id}
    )`;
    return this.db
      .select({
        id: transferRequests.id,
        requestedBy: transferRequests.requestedBy,
        shiftId: transferRequests.shiftId,
        requestedByName: requester.name,
        notes: transferRequests.notes,
        status: transferRequests.status,
        reviewedBy: transferRequests.reviewedBy,
        reviewedByName: reviewer.name,
        rejectionReason: transferRequests.rejectionReason,
        reviewedAt: transferRequests.reviewedAt,
        createdAt: transferRequests.createdAt,
        lineCount,
      })
      .from(transferRequests)
      .innerJoin(requester, eq(transferRequests.requestedBy, requester.id))
      .leftJoin(reviewer, eq(transferRequests.reviewedBy, reviewer.id))
      .where(branchCondition(transferRequests))
      .orderBy(desc(transferRequests.createdAt), desc(transferRequests.id));
  }

  async findRequestById(id: number) {
    const [row] = await this.db
      .select({
        id: transferRequests.id,
        requestedBy: transferRequests.requestedBy,
        shiftId: transferRequests.shiftId,
        requestedByName: requester.name,
        notes: transferRequests.notes,
        status: transferRequests.status,
        reviewedBy: transferRequests.reviewedBy,
        reviewedByName: reviewer.name,
        rejectionReason: transferRequests.rejectionReason,
        reviewedAt: transferRequests.reviewedAt,
        createdAt: transferRequests.createdAt,
      })
      .from(transferRequests)
      .innerJoin(requester, eq(transferRequests.requestedBy, requester.id))
      .leftJoin(reviewer, eq(transferRequests.reviewedBy, reviewer.id))
      .where(branchCondition(transferRequests, eq(transferRequests.id, id)));
    return row;
  }

  async lockRequest(id: number) {
    const [row] = await this.db
      .select()
      .from(transferRequests)
      .where(branchCondition(transferRequests, eq(transferRequests.id, id)))
      .for("update");
    return row;
  }

  listRequestLines(requestId: number) {
    return this.db
      .select({
        id: transferRequestLines.id,
        itemId: transferRequestLines.itemId,
        itemCode: items.code,
        itemName: items.name,
        stockUnit: items.stockUnit,
        quantity: transferRequestLines.quantity,
      })
      .from(transferRequestLines)
      .innerJoin(
        items,
        branchCondition(items, eq(transferRequestLines.itemId, items.id)),
      )
      .where(
        branchCondition(
          transferRequestLines,
          eq(transferRequestLines.requestId, requestId),
        ),
      )
      .orderBy(transferRequestLines.id);
  }

  async createTransfer(data: {
    requestId: number | null;
    purchaseInvoiceId: number | null;
    createdBy: number;
    approvedBy: number;
    notes: string | null;
  }) {
    const [result] = await this.db.insert(transfers).values(branchValues(data));
    return result.insertId;
  }

  async createTransferLine(data: {
    transferId: number;
    itemId: number;
    quantity: string;
    unitCost: string;
    sourceBatchId: number;
    cafeBatchId: number;
  }) {
    await this.db.insert(transferLines).values(branchValues(data));
  }

  async approveRequest(id: number, reviewedBy: number) {
    await this.db
      .update(transferRequests)
      .set({ status: "approved", reviewedBy, reviewedAt: new Date() })
      .where(branchCondition(transferRequests, eq(transferRequests.id, id)));
  }

  async rejectRequest(id: number, reviewedBy: number, reason: string) {
    await this.db
      .update(transferRequests)
      .set({
        status: "rejected",
        reviewedBy,
        rejectionReason: reason,
        reviewedAt: new Date(),
      })
      .where(branchCondition(transferRequests, eq(transferRequests.id, id)));
  }

  listTransfers() {
    const totalCost = sql<string>`CAST(COALESCE((
      SELECT SUM(ROUND(tl.quantity * tl.unit_cost, 2))
      FROM ${branchTable("transfer_lines")} tl
      WHERE tl.transfer_id = ${transfers.id}
    ), 0) AS DECIMAL(30,2))`;
    return this.db
      .select({
        id: transfers.id,
        requestId: transfers.requestId,
        createdBy: transfers.createdBy,
        createdByName: transferCreator.name,
        approvedBy: transfers.approvedBy,
        approvedByName: transferApprover.name,
        notes: transfers.notes,
        totalCost,
        createdAt: transfers.createdAt,
      })
      .from(transfers)
      .innerJoin(transferCreator, eq(transfers.createdBy, transferCreator.id))
      .innerJoin(
        transferApprover,
        eq(transfers.approvedBy, transferApprover.id),
      )
      .where(branchCondition(transfers))
      .orderBy(desc(transfers.createdAt), desc(transfers.id));
  }

  async findTransferById(id: number) {
    const totalCost = sql<string>`CAST(COALESCE((
      SELECT SUM(ROUND(tl.quantity * tl.unit_cost, 2))
      FROM ${branchTable("transfer_lines")} tl
      WHERE tl.transfer_id = ${transfers.id}
    ), 0) AS DECIMAL(30,2))`;
    const [row] = await this.db
      .select({
        id: transfers.id,
        requestId: transfers.requestId,
        createdBy: transfers.createdBy,
        createdByName: transferCreator.name,
        approvedBy: transfers.approvedBy,
        approvedByName: transferApprover.name,
        notes: transfers.notes,
        totalCost,
        createdAt: transfers.createdAt,
      })
      .from(transfers)
      .innerJoin(transferCreator, eq(transfers.createdBy, transferCreator.id))
      .innerJoin(
        transferApprover,
        eq(transfers.approvedBy, transferApprover.id),
      )
      .where(branchCondition(transfers, eq(transfers.id, id)));
    return row;
  }

  listTransferLines(transferId: number) {
    return this.db
      .select({
        id: transferLines.id,
        itemId: transferLines.itemId,
        itemCode: items.code,
        itemName: items.name,
        stockUnit: items.stockUnit,
        quantity: transferLines.quantity,
        unitCost: transferLines.unitCost,
        lineCost: sql<string>`CAST(ROUND(${transferLines.quantity} * ${transferLines.unitCost}, 2) AS DECIMAL(30,2))`,
        sourceBatchId: transferLines.sourceBatchId,
        cafeBatchId: transferLines.cafeBatchId,
      })
      .from(transferLines)
      .innerJoin(
        items,
        branchCondition(items, eq(transferLines.itemId, items.id)),
      )
      .where(
        branchCondition(
          transferLines,
          eq(transferLines.transferId, transferId),
        ),
      )
      .orderBy(transferLines.id);
  }
}
