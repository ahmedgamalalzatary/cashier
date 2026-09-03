import { sql, type SQL } from "drizzle-orm";
import type { Db } from "../../db/index.js";

export class ReportsRepository {
  constructor(private db: Db) {}

  private async rows<T>(query: SQL): Promise<T[]> {
    const [rows] = await this.db.execute(query);
    return rows as unknown as T[];
  }

  dashboard(start: Date, end: Date) {
    return this.rows<Record<string, unknown>>(sql`
      SELECT
        COALESCE((SELECT SUM(total) FROM orders WHERE created_at >= ${start} AND created_at < ${end}), 0) AS sales,
        COALESCE((SELECT SUM(amount) FROM refunds WHERE created_at >= ${start} AND created_at < ${end}), 0) AS refunds,
        COALESCE((SELECT SUM(discount_amount) FROM orders WHERE created_at >= ${start} AND created_at < ${end}), 0) AS discounts,
        COALESCE((SELECT SUM(total - total_cost) FROM orders WHERE created_at >= ${start} AND created_at < ${end}), 0)
          - COALESCE((SELECT SUM(amount - total_cost_returned) FROM refunds WHERE created_at >= ${start} AND created_at < ${end}), 0) AS grossProfit,
        (SELECT COUNT(*) FROM orders WHERE created_at >= ${start} AND created_at < ${end}) AS ordersCount,
        (SELECT COUNT(*) FROM transfer_requests WHERE status = 'pending') AS pendingTransfers,
        (SELECT COUNT(*) FROM orders WHERE is_negative_stock = 1 AND created_at >= ${start} AND created_at < ${end}) AS negativeStockOrders
    `);
  }

  openShift() {
    return this.rows<Record<string, unknown>>(sql`
      SELECT s.id, e.name AS cashierName, s.opening_float AS openingFloat, s.opened_at AS openedAt,
        COALESCE((SELECT SUM(o.total) FROM orders o WHERE o.shift_id=s.id),0) AS sales,
        COALESCE((SELECT SUM(r.amount) FROM refunds r WHERE r.shift_id=s.id),0) AS refunds,
        COALESCE((SELECT SUM(x.amount) FROM expenses x WHERE x.shift_id=s.id),0) AS expenses
      FROM shifts s JOIN employees e ON e.id=s.employee_id WHERE s.open_slot=1 LIMIT 1
    `);
  }

  stock() {
    return this.rows<Record<string, unknown>>(sql`
      SELECT i.id AS itemId, i.code, i.name, i.is_active AS isActive, c.name AS categoryName, i.stock_unit AS stockUnit, w.warehouse,
        COALESCE((SELECT SUM(sm.quantity) FROM stock_movements sm WHERE sm.item_id=i.id AND sm.warehouse=w.warehouse),0) AS quantity,
        COALESCE((SELECT SUM(sb.remaining_quantity*sb.unit_cost) FROM stock_batches sb WHERE sb.item_id=i.id AND sb.warehouse=w.warehouse),0) AS stockValue,
        CASE WHEN w.warehouse='main' THEN i.main_minimum_level ELSE i.cafe_minimum_level END AS minimumLevel
      FROM items i JOIN categories c ON c.id=i.category_id
      CROSS JOIN (SELECT 'main' AS warehouse UNION ALL SELECT 'cafe') w
      ORDER BY i.name,w.warehouse
    `);
  }

  salesByDay(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
      SELECT * FROM (
        SELECT created_at createdAt,total sales,discount_amount discounts,0 refunds,
          total_cost cost,0 returnedCost,1 ordersCount
        FROM orders WHERE created_at >= ${from} AND created_at < ${to}
        UNION ALL
        SELECT created_at,0,0,amount,0,total_cost_returned,0
        FROM refunds WHERE created_at >= ${from} AND created_at < ${to}
      ) x ORDER BY createdAt
    `);
  }

  salesByProduct(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
      SELECT productName,sizeName,SUM(quantity) quantity,SUM(sales) sales,SUM(refunds) refunds,
        SUM(cost) cost,SUM(returnedCost) returnedCost,SUM(sales-refunds-cost+returnedCost) profit
      FROM (
        SELECT ol.product_name productName,ol.size_name sizeName,SUM(ol.quantity) quantity,
          SUM(COALESCE(ol.line_subtotal * o.total / NULLIF(o.subtotal,0),0)) sales,0 refunds,SUM(ol.total_cost) cost,0 returnedCost
        FROM order_lines ol JOIN orders o ON o.id=ol.order_id
        WHERE o.created_at >= ${from} AND o.created_at < ${to} GROUP BY ol.product_name,ol.size_name
        UNION ALL
        SELECT rl.product_name,rl.size_name,-SUM(rl.quantity),0,SUM(rl.refund_amount),0,SUM(rl.returned_cost)
        FROM refund_lines rl JOIN refunds r ON r.id=rl.refund_id
        WHERE r.created_at >= ${from} AND r.created_at < ${to} GROUP BY rl.product_name,rl.size_name
      ) x GROUP BY productName,sizeName ORDER BY sales DESC
    `);
  }

  salesByCategory(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
      SELECT mainCategory,category,SUM(sales) sales,SUM(refunds) refunds,SUM(cost) cost,
        SUM(returnedCost) returnedCost,SUM(sales-refunds-cost+returnedCost) profit FROM (
        SELECT COALESCE(pc.name,c.name) mainCategory,c.name category,
          SUM(COALESCE(ol.line_subtotal * o.total / NULLIF(o.subtotal,0),0)) sales,0 refunds,SUM(ol.total_cost) cost,0 returnedCost
        FROM order_lines ol JOIN orders o ON o.id=ol.order_id
        LEFT JOIN recipes rp ON rp.id=ol.recipe_id LEFT JOIN items i ON i.id=ol.item_id
        JOIN categories c ON c.id=COALESCE(rp.category_id,i.category_id) LEFT JOIN categories pc ON pc.id=c.parent_id
        WHERE o.created_at >= ${from} AND o.created_at < ${to} GROUP BY COALESCE(pc.name,c.name),c.name
        UNION ALL
        SELECT COALESCE(pc.name,c.name),c.name,0,SUM(rl.refund_amount),0,SUM(rl.returned_cost)
        FROM refund_lines rl JOIN refunds r ON r.id=rl.refund_id JOIN order_lines ol ON ol.id=rl.order_line_id
        LEFT JOIN recipes rp ON rp.id=ol.recipe_id LEFT JOIN items i ON i.id=ol.item_id
        JOIN categories c ON c.id=COALESCE(rp.category_id,i.category_id) LEFT JOIN categories pc ON pc.id=c.parent_id
        WHERE r.created_at >= ${from} AND r.created_at < ${to} GROUP BY COALESCE(pc.name,c.name),c.name
      ) x GROUP BY mainCategory,category ORDER BY sales DESC
    `);
  }

  salesByShift(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
      SELECT s.id shiftId,e.name cashierName,s.opened_at openedAt,s.closed_at closedAt,
        s.over_short overShort,
        COALESCE(SUM(o.total),0) sales,COALESCE(SUM(o.discount_amount),0) discounts,
        COALESCE((SELECT SUM(r.amount) FROM refunds r WHERE r.shift_id=s.id),0) refunds,
        COALESCE(SUM(o.total_cost),0) cost,
        COALESCE(SUM(o.total-o.total_cost),0)-COALESCE((SELECT SUM(r.amount-r.total_cost_returned) FROM refunds r WHERE r.shift_id=s.id),0) profit
      FROM shifts s JOIN employees e ON e.id=s.employee_id LEFT JOIN orders o ON o.shift_id=s.id
      WHERE s.opened_at >= ${from} AND s.opened_at < ${to} GROUP BY s.id,e.name,s.opened_at,s.closed_at ORDER BY s.opened_at DESC
    `);
  }

  salesByCashier(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
      SELECT e.id employeeId,e.name cashierName,COUNT(DISTINCT o.id) ordersCount,
        COALESCE(SUM(o.total),0) sales,COALESCE(SUM(o.discount_amount),0) discounts,
        COALESCE((SELECT SUM(r.amount) FROM refunds r WHERE r.cashier_id=u.id AND r.created_at >= ${from} AND r.created_at < ${to}),0) refunds,
        COALESCE(SUM(o.total_cost),0) cost,
        COALESCE(SUM(o.total-o.total_cost),0)-COALESCE((SELECT SUM(r.amount-r.total_cost_returned) FROM refunds r WHERE r.cashier_id=u.id AND r.created_at >= ${from} AND r.created_at < ${to}),0) profit
      FROM users u JOIN employees e ON e.id=u.employee_id LEFT JOIN orders o ON o.cashier_id=u.id AND o.created_at >= ${from} AND o.created_at < ${to}
      WHERE u.role='cashier' GROUP BY e.id,e.name,u.id ORDER BY sales DESC
    `);
  }

  ledger(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
    SELECT sm.id,sm.occurred_at occurredAt,i.code,i.name itemName,sm.warehouse,sm.movement_type movementType,
      sm.quantity,sm.unit_cost unitCost,sm.quantity*sm.unit_cost totalCost,sm.reference_type referenceType,sm.reference_id referenceId,sm.notes
    FROM stock_movements sm JOIN items i ON i.id=sm.item_id WHERE sm.occurred_at >= ${from} AND sm.occurred_at < ${to}
    ORDER BY sm.occurred_at DESC,sm.id DESC
  `);
  }

  cashFlow(from: Date, to: Date, fromDate: string, toDate: string) {
    return this.rows<Record<string, unknown>>(sql`
    SELECT * FROM (
      SELECT created_at occurredAt,'sale' type,order_number reference,total amount FROM orders WHERE created_at >= ${from} AND created_at < ${to}
      UNION ALL SELECT created_at,'refund',CONCAT('#',id),-amount FROM refunds WHERE created_at >= ${from} AND created_at < ${to}
      UNION ALL SELECT CONCAT(expense_date,' 12:00:00'),'expense',CONCAT('#',id),-amount FROM expenses WHERE expense_date BETWEEN ${fromDate} AND ${toDate}
      UNION ALL SELECT CONCAT(paid_at,' 12:00:00'),'supplier_payment',CONCAT('#',id),-amount FROM supplier_payments WHERE paid_at BETWEEN ${fromDate} AND ${toDate}
    ) x ORDER BY occurredAt DESC
  `);
  }

  expenseBreakdown(from: string, to: string) {
    return this.rows<Record<string, unknown>>(sql`
    SELECT ec.name categoryName,COUNT(*) entriesCount,SUM(e.amount) amount FROM expenses e JOIN expense_categories ec ON ec.id=e.category_id
    WHERE e.expense_date BETWEEN ${from} AND ${to} GROUP BY ec.id,ec.name ORDER BY amount DESC
  `);
  }

  employees(from: Date, to: Date, fromDate: string, toDate: string) {
    return this.rows<Record<string, unknown>>(sql`
    SELECT e.id,e.name,COUNT(DISTINCT s.id) shiftsCount,
      COALESCE(SUM(TIMESTAMPDIFF(MINUTE,GREATEST(s.opened_at,${from}),LEAST(COALESCE(s.closed_at,CURRENT_TIMESTAMP),${to}))),0) workedMinutes,
      COALESCE((SELECT COUNT(*) FROM orders o JOIN users u ON u.id=o.cashier_id WHERE u.employee_id=e.id AND o.created_at >= ${from} AND o.created_at < ${to}),0) ordersCount,
      COALESCE((SELECT COUNT(*) FROM refunds r JOIN users u ON u.id=r.cashier_id WHERE u.employee_id=e.id AND r.created_at >= ${from} AND r.created_at < ${to}),0) refundsCount,
      COALESCE((SELECT SUM(o.discount_amount) FROM orders o JOIN users u ON u.id=o.cashier_id WHERE u.employee_id=e.id AND o.created_at >= ${from} AND o.created_at < ${to}),0) discounts,
      COALESCE((SELECT COUNT(*) FROM waste_entries w JOIN users u ON u.id=w.recorded_by WHERE u.employee_id=e.id AND w.occurred_at >= ${from} AND w.occurred_at < ${to}),0) wasteCount,
      COALESCE((SELECT COUNT(*) FROM expenses x JOIN users u ON u.id=x.recorded_by WHERE u.employee_id=e.id AND x.expense_date BETWEEN ${fromDate} AND ${toDate}),0) expensesCount,
      COALESCE((SELECT COUNT(*) FROM transfer_requests tr JOIN users u ON u.id=tr.requested_by WHERE u.employee_id=e.id AND tr.created_at >= ${from} AND tr.created_at < ${to}),0) transferRequestsCount
    FROM employees e LEFT JOIN shifts s ON s.employee_id=e.id AND s.opened_at < ${to} AND COALESCE(s.closed_at,CURRENT_TIMESTAMP) >= ${from}
    GROUP BY e.id,e.name ORDER BY e.name
  `);
  }

  waste(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
    SELECT w.id,w.occurred_at occurredAt,w.target_name targetName,w.size_name sizeName,w.warehouse,w.quantity,
      w.reason_code reasonCode,w.reason,w.note,w.total_cost totalCost,u.name recordedByName
    FROM waste_entries w JOIN users u ON u.id=w.recorded_by WHERE w.occurred_at >= ${from} AND w.occurred_at < ${to}
    ORDER BY w.occurred_at DESC,w.id DESC
  `);
  }

  wasteSummary(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
    SELECT w.target_name targetName,w.size_name sizeName,w.warehouse,w.reason,u.name recordedByName,
      SUM(w.quantity) quantity,SUM(w.total_cost) totalCost,COUNT(*) entriesCount
    FROM waste_entries w JOIN users u ON u.id=w.recorded_by WHERE w.occurred_at >= ${from} AND w.occurred_at < ${to}
    GROUP BY w.target_name,w.size_name,w.warehouse,w.reason,u.name ORDER BY totalCost DESC
  `);
  }

  refunds(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
    SELECT r.id,r.created_at occurredAt,o.order_number orderNumber,u.name cashierName,r.reason,r.amount,r.total_cost_returned totalCostReturned
    FROM refunds r JOIN orders o ON o.id=r.order_id JOIN users u ON u.id=r.cashier_id
    WHERE r.created_at >= ${from} AND r.created_at < ${to} ORDER BY r.created_at DESC,r.id DESC
  `);
  }

  refundSummary(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
    SELECT rl.product_name productName,rl.size_name sizeName,r.reason,u.name cashierName,
      SUM(rl.quantity) quantity,SUM(rl.refund_amount) amount,SUM(rl.returned_cost) returnedCost,COUNT(DISTINCT r.id) refundsCount
    FROM refund_lines rl JOIN refunds r ON r.id=rl.refund_id JOIN users u ON u.id=r.cashier_id
    WHERE r.created_at >= ${from} AND r.created_at < ${to}
    GROUP BY rl.product_name,rl.size_name,r.reason,u.name ORDER BY amount DESC
  `);
  }

  suppliers() {
    return this.rows<Record<string, unknown>>(sql`
    SELECT s.id,s.name,s.opening_balance openingBalance,
      COALESCE((SELECT SUM(p.total_amount) FROM purchase_invoices p WHERE p.supplier_id=s.id),0) purchases,
      COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplier_id=s.id),0) payments,
      s.opening_balance+COALESCE((SELECT SUM(p.total_amount) FROM purchase_invoices p WHERE p.supplier_id=s.id),0)-COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplier_id=s.id),0) balance
    FROM suppliers s ORDER BY s.name
  `);
  }

  supplierPurchases(from: string, to: string) {
    return this.rows<Record<string, unknown>>(sql`
    SELECT p.id,p.purchased_at purchasedAt,p.invoice_number invoiceNumber,s.name supplierName,p.total_amount totalAmount,p.paid_amount paidAmount
    FROM purchase_invoices p JOIN suppliers s ON s.id=p.supplier_id WHERE p.purchased_at BETWEEN ${from} AND ${to}
    ORDER BY p.purchased_at DESC,p.id DESC
  `);
  }

  supplierPayments(from: string, to: string) {
    return this.rows<Record<string, unknown>>(sql`
    SELECT sp.id,sp.paid_at paidAt,s.name supplierName,sp.amount,sp.notes
    FROM supplier_payments sp JOIN suppliers s ON s.id=sp.supplier_id WHERE sp.paid_at BETWEEN ${from} AND ${to}
    ORDER BY sp.paid_at DESC,sp.id DESC
  `);
  }
}
