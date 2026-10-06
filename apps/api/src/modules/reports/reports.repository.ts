import { branchTable } from "../../db/branch-context.js";
import { sql, type SQL } from "drizzle-orm";
import type { Db } from "../../db/index.js";

export class ReportsRepository {
  constructor(private db: Db) {}

  snapshot<T>(read: (repo: ReportsRepository) => Promise<T>): Promise<T> {
    return this.db.transaction(
      (tx) => read(new ReportsRepository(tx as unknown as Db)),
      {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      },
    );
  }

  private async rows<T>(query: SQL): Promise<T[]> {
    const [rows] = await this.db.execute(query);
    // Raw MySQL DATETIME/TIMESTAMP results have no offset. Expose UTC ISO
    // timestamps so Cairo grouping and clients never use the host timezone.
    return (rows as unknown as Record<string, unknown>[]).map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          [
            "occurredAt",
            "createdAt",
            "openedAt",
            "closedAt",
            "confirmedAt",
            "reviewedAt",
            "paidAt",
            "purchasedAt",
          ].includes(key) &&
          typeof value === "string" &&
          /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
            ? `${value.replace(" ", "T")}Z`
            : value,
        ]),
      ),
    ) as T[];
  }

  dashboard(start: Date, end: Date) {
    return this.rows<Record<string, unknown>>(sql`
      SELECT
        COALESCE((SELECT SUM(total) FROM ${branchTable("orders")} orders WHERE created_at >= ${start} AND created_at < ${end}), 0) AS sales,
        COALESCE((SELECT SUM(amount) FROM ${branchTable("refunds")} refunds WHERE created_at >= ${start} AND created_at < ${end}), 0) AS refunds,
        COALESCE((SELECT SUM(discount_amount) FROM ${branchTable("orders")} orders WHERE created_at >= ${start} AND created_at < ${end}), 0) AS discounts,
        COALESCE((SELECT SUM(total - total_cost) FROM ${branchTable("orders")} orders WHERE created_at >= ${start} AND created_at < ${end}), 0)
          - COALESCE((SELECT SUM(amount - total_cost_returned) FROM ${branchTable("refunds")} refunds WHERE created_at >= ${start} AND created_at < ${end}), 0) AS grossProfit,
        (SELECT COUNT(*) FROM ${branchTable("orders")} orders WHERE created_at >= ${start} AND created_at < ${end}) AS ordersCount,
        (SELECT COUNT(*) FROM ${branchTable("transfer_requests")} transfer_requests WHERE status = 'pending') AS pendingTransfers,
        (SELECT COUNT(*) FROM ${branchTable("orders")} orders WHERE is_negative_stock = 1 AND created_at >= ${start} AND created_at < ${end}) AS negativeStockOrders
    `);
  }

  openShifts() {
    return this.rows<Record<string, unknown>>(sql`
      SELECT s.id, e.name AS cashierName, s.opening_float AS openingFloat, s.opened_at AS openedAt,
        COALESCE((SELECT SUM(o.total) FROM ${branchTable("orders")} o WHERE o.shift_id=s.id),0) AS sales,
        COALESCE((SELECT SUM(r.amount) FROM ${branchTable("refunds")} r WHERE r.shift_id=s.id),0) AS refunds,
        COALESCE((SELECT SUM(x.amount) FROM ${branchTable("expenses")} x WHERE x.shift_id=s.id),0) AS expenses
      FROM ${branchTable("shifts")} s JOIN ${branchTable("employees")} e ON e.id=s.employee_id WHERE s.open_slot=1 ORDER BY s.opened_at DESC,s.id DESC
    `);
  }

  stock() {
    return this.rows<Record<string, unknown>>(sql`
      SELECT i.id AS itemId, i.code, i.name, i.is_active AS isActive, c.name AS categoryName, i.stock_unit AS stockUnit, w.warehouse,
        COALESCE((SELECT SUM(sm.quantity) FROM ${branchTable("stock_movements")} sm WHERE sm.item_id=i.id AND sm.warehouse=w.warehouse),0) AS quantity,
        COALESCE((SELECT SUM(sb.remaining_quantity*sb.unit_cost) FROM ${branchTable("stock_batches")} sb WHERE sb.item_id=i.id AND sb.warehouse=w.warehouse),0) AS stockValue,
        CASE WHEN w.warehouse='main' THEN i.main_minimum_level ELSE i.cafe_minimum_level END AS minimumLevel
      FROM ${branchTable("items")} i JOIN ${branchTable("categories")} c ON c.id=i.category_id
      CROSS JOIN (SELECT 'main' AS warehouse UNION ALL SELECT 'cafe') w
      ORDER BY i.name,w.warehouse
    `);
  }

  salesByDay(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
      SELECT * FROM (
        SELECT created_at createdAt,total sales,discount_amount discounts,0 refunds,
          total_cost cost,0 returnedCost,1 ordersCount
        FROM ${branchTable("orders")} orders WHERE created_at >= ${from} AND created_at < ${to}
        UNION ALL
        SELECT created_at,0,0,amount,0,total_cost_returned,0
        FROM ${branchTable("refunds")} refunds WHERE created_at >= ${from} AND created_at < ${to}
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
        FROM ${branchTable("order_lines")} ol JOIN ${branchTable("orders")} o ON o.id=ol.order_id
        WHERE o.created_at >= ${from} AND o.created_at < ${to} GROUP BY ol.product_name,ol.size_name
        UNION ALL
        SELECT rl.product_name,rl.size_name,-SUM(rl.quantity),0,SUM(rl.refund_amount),0,SUM(rl.returned_cost)
        FROM ${branchTable("refund_lines")} rl JOIN ${branchTable("refunds")} r ON r.id=rl.refund_id
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
        FROM ${branchTable("order_lines")} ol JOIN ${branchTable("orders")} o ON o.id=ol.order_id
        LEFT JOIN ${branchTable("recipes")} rp ON rp.id=ol.recipe_id LEFT JOIN ${branchTable("items")} i ON i.id=ol.item_id
        JOIN ${branchTable("categories")} c ON c.id=COALESCE(rp.category_id,i.category_id) LEFT JOIN ${branchTable("categories")} pc ON pc.id=c.parent_id
        WHERE o.created_at >= ${from} AND o.created_at < ${to} GROUP BY COALESCE(pc.name,c.name),c.name
        UNION ALL
        SELECT COALESCE(pc.name,c.name),c.name,0,SUM(rl.refund_amount),0,SUM(rl.returned_cost)
        FROM ${branchTable("refund_lines")} rl JOIN ${branchTable("refunds")} r ON r.id=rl.refund_id JOIN ${branchTable("order_lines")} ol ON ol.id=rl.order_line_id
        LEFT JOIN ${branchTable("recipes")} rp ON rp.id=ol.recipe_id LEFT JOIN ${branchTable("items")} i ON i.id=ol.item_id
        JOIN ${branchTable("categories")} c ON c.id=COALESCE(rp.category_id,i.category_id) LEFT JOIN ${branchTable("categories")} pc ON pc.id=c.parent_id
        WHERE r.created_at >= ${from} AND r.created_at < ${to} GROUP BY COALESCE(pc.name,c.name),c.name
        UNION ALL
        SELECT ec.name_ar mainCategory,ec.name_ar category,
          SUM(COALESCE(ol.line_subtotal * o.total / NULLIF(o.subtotal,0),0)) sales,0 refunds,SUM(ol.total_cost) cost,0 returnedCost
        FROM ${branchTable("order_lines")} ol JOIN ${branchTable("orders")} o ON o.id=ol.order_id
        JOIN ${branchTable("external_products")} ep ON ep.external_id=ol.external_product_id
        JOIN ${branchTable("external_categories")} ec ON ec.external_id=ep.external_category_id
        WHERE o.created_at >= ${from} AND o.created_at < ${to} GROUP BY ec.name_ar
        UNION ALL
        SELECT ec.name_ar,ec.name_ar,0,SUM(rl.refund_amount),0,SUM(rl.returned_cost)
        FROM ${branchTable("refund_lines")} rl JOIN ${branchTable("refunds")} r ON r.id=rl.refund_id JOIN ${branchTable("order_lines")} ol ON ol.id=rl.order_line_id
        JOIN ${branchTable("external_products")} ep ON ep.external_id=ol.external_product_id
        JOIN ${branchTable("external_categories")} ec ON ec.external_id=ep.external_category_id
        WHERE r.created_at >= ${from} AND r.created_at < ${to} GROUP BY ec.name_ar
      ) x GROUP BY mainCategory,category ORDER BY sales DESC
    `);
  }

  salesByShift(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
      WITH period_sales AS (
        SELECT shift_id,SUM(total) sales,SUM(discount_amount) discounts,SUM(total_cost) cost,COUNT(*) ordersCount
        FROM ${branchTable("orders")} o WHERE created_at >= ${from} AND created_at < ${to} GROUP BY shift_id
      ), period_refunds AS (
        SELECT shift_id,SUM(amount) refunds,SUM(total_cost_returned) returnedCost
        FROM ${branchTable("refunds")} r WHERE created_at >= ${from} AND created_at < ${to} GROUP BY shift_id
      )
      SELECT s.id shiftId,e.name cashierName,s.status,s.opened_at openedAt,s.closed_at closedAt,
        s.opening_float openingFloat,s.expected_cash expectedCash,s.actual_cash actualCash,s.over_short overShort,
        COALESCE(o.sales,0) sales,COALESCE(o.discounts,0) discounts,COALESCE(r.refunds,0) refunds,
        COALESCE(o.cost,0) cost,COALESCE(r.returnedCost,0) returnedCost,COALESCE(o.ordersCount,0) ordersCount,
        COALESCE(o.sales,0)-COALESCE(r.refunds,0)-COALESCE(o.cost,0)+COALESCE(r.returnedCost,0) profit,
        COALESCE((SELECT SUM(total) FROM ${branchTable("orders")} lo WHERE lo.shift_id=s.id),0) lifetimeSales,
        COALESCE((SELECT SUM(amount) FROM ${branchTable("refunds")} lr WHERE lr.shift_id=s.id),0) lifetimeRefunds,
        COALESCE((SELECT SUM(amount) FROM ${branchTable("expenses")} lx WHERE lx.shift_id=s.id),0) lifetimeExpenses
      FROM ${branchTable("shifts")} s JOIN ${branchTable("employees")} e ON e.id=s.employee_id
      LEFT JOIN period_sales o ON o.shift_id=s.id LEFT JOIN period_refunds r ON r.shift_id=s.id
      WHERE o.shift_id IS NOT NULL OR r.shift_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM ${branchTable("shift_events")} se WHERE se.shift_id=s.id
          AND se.action IN ('open','reopen') AND se.occurred_at < ${to}
          AND COALESCE((SELECT c.occurred_at FROM ${branchTable("shift_events")} c
            WHERE c.shift_id=s.id AND c.action IN ('close','admin_close')
              AND (c.occurred_at > se.occurred_at OR (c.occurred_at=se.occurred_at AND c.id>se.id))
            ORDER BY c.occurred_at,c.id LIMIT 1),s.closed_at,CURRENT_TIMESTAMP) > ${from})
      ORDER BY s.opened_at DESC,s.id DESC
    `);
  }

  shiftHistory(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
      SELECT se.id,se.shift_id shiftId,e.name cashierName,u.name actorName,se.action,
        se.occurred_at occurredAt,se.opening_float openingFloat,se.expected_cash expectedCash,
        se.actual_cash actualCash,se.over_short overShort,se.note
      FROM ${branchTable("shift_events")} se JOIN ${branchTable("shifts")} s ON s.id=se.shift_id
      JOIN ${branchTable("employees")} e ON e.id=s.employee_id JOIN users u ON u.id=se.actor_user_id
      WHERE se.occurred_at >= ${from} AND se.occurred_at < ${to}
      ORDER BY se.occurred_at DESC,se.id DESC
    `);
  }

  salesByCashier(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
      SELECT u.id employeeId,
        CASE WHEN u.role='admin' THEN CONCAT(u.name,' (إدارة)') ELSE COALESCE(e.name,u.name) END cashierName,
        COUNT(DISTINCT o.id) ordersCount,
        COALESCE(SUM(o.total),0) sales,COALESCE(SUM(o.discount_amount),0) discounts,
        COALESCE((SELECT SUM(r.amount) FROM ${branchTable("refunds")} r WHERE r.cashier_id=u.id AND r.created_at >= ${from} AND r.created_at < ${to}),0) refunds,
        COALESCE(SUM(o.total_cost),0) cost,
        COALESCE(SUM(o.total-o.total_cost),0)-COALESCE((SELECT SUM(r.amount-r.total_cost_returned) FROM ${branchTable("refunds")} r WHERE r.cashier_id=u.id AND r.created_at >= ${from} AND r.created_at < ${to}),0) profit
      FROM users u LEFT JOIN ${branchTable("employees")} e ON e.id=u.employee_id LEFT JOIN ${branchTable("orders")} o ON o.cashier_id=u.id AND o.created_at >= ${from} AND o.created_at < ${to}
      WHERE u.role IN ('admin','cashier') GROUP BY u.id,u.name,u.role,e.id,e.name ORDER BY sales DESC
    `);
  }

  ledger(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
    SELECT sm.id,sm.occurred_at occurredAt,i.code,i.name itemName,sm.warehouse,sm.movement_type movementType,
      sm.quantity,sm.unit_cost unitCost,sm.quantity*sm.unit_cost totalCost,sm.reference_type referenceType,sm.reference_id referenceId,sm.notes
    FROM ${branchTable("stock_movements")} sm JOIN ${branchTable("items")} i ON i.id=sm.item_id WHERE sm.occurred_at >= ${from} AND sm.occurred_at < ${to}
    ORDER BY sm.occurred_at DESC,sm.id DESC
  `);
  }

  stocktakes(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
      SELECT st.id,st.kind,st.warehouse,st.status,st.note,st.created_at createdAt,st.confirmed_at confirmedAt,
        u.name createdByName,COUNT(sl.id) lineCount,
        COALESCE(SUM(CASE WHEN sl.counted_quantity < sl.recorded_quantity THEN sl.recorded_quantity-sl.counted_quantity ELSE 0 END),0) shortageQuantity,
        COALESCE(SUM(CASE WHEN sl.counted_quantity > sl.recorded_quantity THEN sl.counted_quantity-sl.recorded_quantity ELSE 0 END),0) surplusQuantity
      FROM ${branchTable("stocktakes")} st JOIN users u ON u.id=st.created_by LEFT JOIN ${branchTable("stocktake_lines")} sl ON sl.stocktake_id=st.id
      WHERE st.created_at >= ${from} AND st.created_at < ${to}
      GROUP BY st.id,u.name ORDER BY st.created_at DESC,st.id DESC
    `);
  }

  cashFlow(from: Date, to: Date, fromDate: string, toDate: string) {
    return this.rows<Record<string, unknown>>(sql`
    SELECT * FROM (
      SELECT CAST(created_at AS CHAR) occurredAt,'sale' type,order_number reference,total amount FROM ${branchTable("orders")} orders WHERE created_at >= ${from} AND created_at < ${to}
      UNION ALL SELECT CAST(created_at AS CHAR),'refund',CONCAT('#',id),-amount FROM ${branchTable("refunds")} refunds WHERE created_at >= ${from} AND created_at < ${to}
      UNION ALL SELECT CAST(expense_date AS CHAR),'expense',CONCAT('#',id),-amount FROM ${branchTable("expenses")} expenses WHERE expense_date BETWEEN ${fromDate} AND ${toDate}
      UNION ALL SELECT CAST(paid_at AS CHAR),'supplier_payment',CONCAT('#',id),-amount FROM ${branchTable("supplier_payments")} supplier_payments WHERE paid_at BETWEEN ${fromDate} AND ${toDate}
      UNION ALL SELECT CAST(paid_at AS CHAR),'salary_payment',CONCAT('#',id),-net_pay FROM ${branchTable("salary_payments")} salary_payments WHERE paid_at >= ${from} AND paid_at < ${to}
      UNION ALL SELECT CAST(entry_date AS CHAR),'salary_advance',CONCAT('#',id),-amount FROM ${branchTable("salary_advances")} salary_advances WHERE entry_date BETWEEN ${fromDate} AND ${toDate}
    ) x ORDER BY occurredAt DESC
  `);
  }

  expenseBreakdown(from: string, to: string) {
    return this.rows<Record<string, unknown>>(sql`
    SELECT ec.name categoryName,COUNT(*) entriesCount,SUM(e.amount) amount FROM ${branchTable("expenses")} e JOIN ${branchTable("expense_categories")} ec ON ec.id=e.category_id
    WHERE e.expense_date BETWEEN ${from} AND ${to} GROUP BY ec.id,ec.name ORDER BY amount DESC
  `);
  }

  expenses(from: string, to: string) {
    return this.rows<Record<string, unknown>>(sql`
      SELECT e.id,e.expense_date expenseDate,e.type,ec.name categoryName,e.shift_id shiftId,
        e.amount,e.note,u.name recordedByName
      FROM ${branchTable("expenses")} e JOIN ${branchTable("expense_categories")} ec ON ec.id=e.category_id
      JOIN users u ON u.id=e.recorded_by WHERE e.expense_date BETWEEN ${from} AND ${to}
      ORDER BY e.expense_date DESC,e.id DESC
    `);
  }

  transfers(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
      SELECT t.id,t.request_id requestId,t.created_at occurredAt,u.name createdByName,a.name approvedByName,t.notes,
        COUNT(DISTINCT tl.item_id) itemCount,COALESCE(SUM(tl.quantity*tl.unit_cost),0) totalCost
      FROM ${branchTable("transfers")} t JOIN users u ON u.id=t.created_by JOIN users a ON a.id=t.approved_by
      LEFT JOIN ${branchTable("transfer_lines")} tl ON tl.transfer_id=t.id
      WHERE t.created_at >= ${from} AND t.created_at < ${to} GROUP BY t.id,u.name,a.name
      ORDER BY t.created_at DESC,t.id DESC
    `);
  }

  transferLines(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
      SELECT t.id transferId,t.created_at occurredAt,i.code,i.name itemName,i.stock_unit stockUnit,
        SUM(tl.quantity) quantity,SUM(tl.quantity*tl.unit_cost) totalCost
      FROM ${branchTable("transfer_lines")} tl JOIN ${branchTable("transfers")} t ON t.id=tl.transfer_id
      JOIN ${branchTable("items")} i ON i.id=tl.item_id
      WHERE t.created_at >= ${from} AND t.created_at < ${to} GROUP BY t.id,i.id
      ORDER BY t.created_at DESC,t.id DESC,i.name
    `);
  }

  transferRequests(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
      SELECT tr.id,tr.created_at createdAt,tr.status,tr.reviewed_at reviewedAt,tr.shift_id shiftId,
        u.name requestedByName,a.name reviewedByName,tr.rejection_reason rejectionReason,tr.notes,
        COUNT(tl.id) itemCount
      FROM ${branchTable("transfer_requests")} tr JOIN users u ON u.id=tr.requested_by
      LEFT JOIN users a ON a.id=tr.reviewed_by LEFT JOIN ${branchTable("transfer_request_lines")} tl ON tl.request_id=tr.id
      WHERE tr.created_at >= ${from} AND tr.created_at < ${to} GROUP BY tr.id,u.name,a.name
      ORDER BY tr.created_at DESC,tr.id DESC
    `);
  }

  transferRequestLines(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
      SELECT tr.id requestId,i.code,i.name itemName,i.stock_unit stockUnit,tl.quantity
      FROM ${branchTable("transfer_request_lines")} tl JOIN ${branchTable("transfer_requests")} tr ON tr.id=tl.request_id
      JOIN ${branchTable("items")} i ON i.id=tl.item_id
      WHERE tr.created_at >= ${from} AND tr.created_at < ${to} ORDER BY tr.created_at DESC,tr.id DESC,i.name
    `);
  }

  preparations(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
      SELECT p.id,p.occurred_at occurredAt,p.recipe_name recipeName,p.output_item_name outputItemName,
        i.stock_unit stockUnit,p.produced_quantity producedQuantity,p.unit_cost unitCost,p.total_cost totalCost,
        u.name preparedByName,p.notes
      FROM ${branchTable("preparations")} p JOIN users u ON u.id=p.prepared_by
      JOIN ${branchTable("items")} i ON i.id=p.output_item_id
      WHERE p.occurred_at >= ${from} AND p.occurred_at < ${to} ORDER BY p.occurred_at DESC,p.id DESC
    `);
  }

  preparationIngredients(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
      SELECT p.id preparationId,pa.ingredient_item_name itemName,i.stock_unit stockUnit,
        SUM(pa.quantity) quantity,SUM(pa.quantity*pa.unit_cost) totalCost
      FROM ${branchTable("preparation_allocations")} pa JOIN ${branchTable("preparations")} p ON p.id=pa.preparation_id
      JOIN ${branchTable("items")} i ON i.id=pa.ingredient_item_id
      WHERE p.occurred_at >= ${from} AND p.occurred_at < ${to} GROUP BY p.id,pa.ingredient_item_id,pa.ingredient_item_name,i.stock_unit
      ORDER BY p.occurred_at DESC,p.id DESC,pa.ingredient_item_name
    `);
  }

  employees(from: Date, to: Date, fromDate: string, toDate: string) {
    return this.rows<Record<string, unknown>>(sql`
    WITH open_segments AS (
      SELECT s.employee_id,e.shift_id,e.occurred_at startedAt,s.closed_at,
        (SELECT MIN(c.occurred_at) FROM ${branchTable("shift_events")} c
          WHERE c.shift_id=e.shift_id
            AND (c.occurred_at > e.occurred_at OR
              (c.occurred_at=e.occurred_at AND c.id>e.id))
            AND c.action IN ('close','admin_close')) endedAt
      FROM ${branchTable("shift_events")} e JOIN ${branchTable("shifts")} s ON s.id=e.shift_id
      WHERE e.action IN ('open','reopen')
    ),
    worked AS (
      SELECT employee_id,
        COUNT(DISTINCT CASE WHEN LEAST(COALESCE(endedAt,closed_at,CURRENT_TIMESTAMP),${to}) > GREATEST(startedAt,${from}) THEN shift_id END) shiftsCount,
        FLOOR(SUM(GREATEST(0,TIMESTAMPDIFF(SECOND,GREATEST(startedAt,${from}),
          LEAST(COALESCE(endedAt,closed_at,CURRENT_TIMESTAMP),${to}))))/60) workedMinutes
      FROM open_segments GROUP BY employee_id
    )
    SELECT e.id,e.name,COALESCE(w.shiftsCount,0) shiftsCount,
      COALESCE(w.workedMinutes,0) workedMinutes,
      COALESCE((SELECT COUNT(*) FROM ${branchTable("orders")} o JOIN users u ON u.id=o.cashier_id WHERE u.employee_id=e.id AND o.created_at >= ${from} AND o.created_at < ${to}),0) ordersCount,
      COALESCE((SELECT COUNT(*) FROM ${branchTable("refunds")} r JOIN users u ON u.id=r.cashier_id WHERE u.employee_id=e.id AND r.created_at >= ${from} AND r.created_at < ${to}),0) refundsCount,
      COALESCE((SELECT SUM(o.discount_amount) FROM ${branchTable("orders")} o JOIN users u ON u.id=o.cashier_id WHERE u.employee_id=e.id AND o.created_at >= ${from} AND o.created_at < ${to}),0) discounts,
      COALESCE((SELECT COUNT(*) FROM ${branchTable("waste_entries")} w JOIN users u ON u.id=w.recorded_by WHERE u.employee_id=e.id AND w.occurred_at >= ${from} AND w.occurred_at < ${to}),0) wasteCount,
      COALESCE((SELECT COUNT(*) FROM ${branchTable("expenses")} x JOIN users u ON u.id=x.recorded_by WHERE u.employee_id=e.id AND x.expense_date BETWEEN ${fromDate} AND ${toDate}),0) expensesCount,
      COALESCE((SELECT COUNT(*) FROM ${branchTable("transfer_requests")} tr JOIN users u ON u.id=tr.requested_by WHERE u.employee_id=e.id AND tr.created_at >= ${from} AND tr.created_at < ${to}),0) transferRequestsCount
    FROM ${branchTable("employees")} e
    LEFT JOIN worked w ON w.employee_id=e.id
    ORDER BY e.name
  `);
  }

  salaryHistory(from: Date, to: Date, fromDate: string, toDate: string) {
    return this.rows<Record<string, unknown>>(sql`
      SELECT * FROM (
        SELECT CAST(sp.paid_at AS CHAR) occurredAt,e.name employeeName,'payment' type,sp.net_pay amount,sp.period_month periodMonth,NULL note
        FROM ${branchTable("salary_payments")} sp JOIN ${branchTable("employees")} e ON e.id=sp.employee_id WHERE sp.paid_at >= ${from} AND sp.paid_at < ${to}
        UNION ALL SELECT CAST(sa.entry_date AS CHAR),e.name,'advance',sa.amount,NULL,sa.note
        FROM ${branchTable("salary_advances")} sa JOIN ${branchTable("employees")} e ON e.id=sa.employee_id WHERE sa.entry_date BETWEEN ${fromDate} AND ${toDate}
        UNION ALL SELECT CAST(sj.entry_date AS CHAR),e.name,sj.type,sj.amount,NULL,sj.note
        FROM ${branchTable("salary_adjustments")} sj JOIN ${branchTable("employees")} e ON e.id=sj.employee_id WHERE sj.entry_date BETWEEN ${fromDate} AND ${toDate}
      ) x ORDER BY occurredAt DESC
    `);
  }

  waste(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
    SELECT w.id,w.occurred_at occurredAt,w.target_name targetName,w.size_name sizeName,w.warehouse,w.quantity,
      w.reason_code reasonCode,w.reason,w.note,w.total_cost totalCost,u.name recordedByName
    FROM ${branchTable("waste_entries")} w JOIN users u ON u.id=w.recorded_by WHERE w.occurred_at >= ${from} AND w.occurred_at < ${to}
    ORDER BY w.occurred_at DESC,w.id DESC
  `);
  }

  wasteSummary(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
    SELECT w.target_name targetName,w.size_name sizeName,w.warehouse,w.reason,u.name recordedByName,
      SUM(w.quantity) quantity,SUM(w.total_cost) totalCost,COUNT(*) entriesCount
    FROM ${branchTable("waste_entries")} w JOIN users u ON u.id=w.recorded_by WHERE w.occurred_at >= ${from} AND w.occurred_at < ${to}
    GROUP BY w.target_name,w.size_name,w.warehouse,w.reason,u.name ORDER BY totalCost DESC
  `);
  }

  refunds(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
    SELECT r.id,r.created_at occurredAt,o.order_number orderNumber,u.name cashierName,r.reason,r.amount,r.total_cost_returned totalCostReturned
    FROM ${branchTable("refunds")} r JOIN ${branchTable("orders")} o ON o.id=r.order_id JOIN users u ON u.id=r.cashier_id
    WHERE r.created_at >= ${from} AND r.created_at < ${to} ORDER BY r.created_at DESC,r.id DESC
  `);
  }

  refundSummary(from: Date, to: Date) {
    return this.rows<Record<string, unknown>>(sql`
    SELECT rl.product_name productName,rl.size_name sizeName,r.reason,u.name cashierName,
      SUM(rl.quantity) quantity,SUM(rl.refund_amount) amount,SUM(rl.returned_cost) returnedCost,COUNT(DISTINCT r.id) refundsCount
    FROM ${branchTable("refund_lines")} rl JOIN ${branchTable("refunds")} r ON r.id=rl.refund_id JOIN users u ON u.id=r.cashier_id
    WHERE r.created_at >= ${from} AND r.created_at < ${to}
    GROUP BY rl.product_name,rl.size_name,r.reason,u.name ORDER BY amount DESC
  `);
  }

  suppliers() {
    return this.rows<Record<string, unknown>>(sql`
    SELECT s.id,s.name,s.opening_balance openingBalance,
      COALESCE((SELECT SUM(p.total_amount) FROM ${branchTable("purchase_invoices")} p WHERE p.supplier_id=s.id),0) purchases,
      COALESCE((SELECT SUM(sp.amount) FROM ${branchTable("supplier_payments")} sp WHERE sp.supplier_id=s.id),0) payments,
      s.opening_balance+COALESCE((SELECT SUM(p.total_amount) FROM ${branchTable("purchase_invoices")} p WHERE p.supplier_id=s.id),0)-COALESCE((SELECT SUM(sp.amount) FROM ${branchTable("supplier_payments")} sp WHERE sp.supplier_id=s.id),0) balance
    FROM ${branchTable("suppliers")} s ORDER BY s.name
  `);
  }

  supplierPurchases(from: string, to: string) {
    return this.rows<Record<string, unknown>>(sql`
    SELECT p.id,p.purchased_at purchasedAt,p.invoice_number invoiceNumber,s.name supplierName,p.total_amount totalAmount,p.paid_amount paidAmount,u.name createdByName,p.notes
    FROM ${branchTable("purchase_invoices")} p JOIN ${branchTable("suppliers")} s ON s.id=p.supplier_id JOIN users u ON u.id=p.created_by WHERE p.purchased_at BETWEEN ${from} AND ${to}
    ORDER BY p.purchased_at DESC,p.id DESC
  `);
  }

  purchaseLines(from: string, to: string) {
    return this.rows<Record<string, unknown>>(sql`
      SELECT p.id invoiceId,p.invoice_number invoiceNumber,p.purchased_at purchasedAt,s.name supplierName,
        i.code,i.name itemName,i.stock_unit stockUnit,pl.stock_quantity stockQuantity,pl.unit_cost unitCost,pl.line_total lineTotal
      FROM ${branchTable("purchase_lines")} pl JOIN ${branchTable("purchase_invoices")} p ON p.id=pl.invoice_id
      JOIN ${branchTable("suppliers")} s ON s.id=p.supplier_id JOIN ${branchTable("items")} i ON i.id=pl.item_id
      WHERE p.purchased_at BETWEEN ${from} AND ${to} ORDER BY p.purchased_at DESC,p.id DESC,pl.id
    `);
  }

  supplierPayments(from: string, to: string) {
    return this.rows<Record<string, unknown>>(sql`
    SELECT sp.id,sp.paid_at paidAt,s.name supplierName,sp.purchase_invoice_id purchaseInvoiceId,sp.amount,sp.notes
    FROM ${branchTable("supplier_payments")} sp JOIN ${branchTable("suppliers")} s ON s.id=sp.supplier_id WHERE sp.paid_at BETWEEN ${from} AND ${to}
    ORDER BY sp.paid_at DESC,sp.id DESC
  `);
  }
}
