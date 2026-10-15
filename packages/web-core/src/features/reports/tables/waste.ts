import type { ReportTable as TableData } from "../../../models/reports-model";
import type { ReportsData } from "../../../services/reports-service";
import { date, money, number } from "../report-columns";

export function wasteTables(d: ReportsData): TableData[] {
  return [
    {
      title: "ملخص الهالك",
      rows: d.wasteAndRefunds.wasteSummary,
      columns: [
        { key: "targetName", label: "الصنف / المنتج" },
        { key: "warehouse", label: "المخزن", kind: "warehouse" },
        {
          key: "reason",
          label: "السبب",
          kind: "event",
          labelSet: "wasteReason",
        },
        { key: "recordedByName", label: "المسجل" },
        number("entriesCount", "العدد"),
        number("quantity", "الكمية"),
        money("totalCost", "التكلفة"),
      ],
    },
    {
      title: "الهالك",
      rows: d.wasteAndRefunds.waste,
      columns: [
        date("occurredAt", "التاريخ"),
        { key: "targetName", label: "الصنف / المنتج" },
        { key: "warehouse", label: "المخزن", kind: "warehouse" },
        number("quantity", "الكمية"),
        {
          key: "reason",
          label: "السبب",
          kind: "event",
          labelSet: "wasteReason",
        },
        money("totalCost", "التكلفة"),
        { key: "recordedByName", label: "المسجل" },
      ],
    },
    {
      title: "ملخص المرتجعات",
      rows: d.wasteAndRefunds.refundSummary,
      columns: [
        { key: "productName", label: "المنتج" },
        { key: "sizeName", label: "الحجم" },
        { key: "reason", label: "السبب" },
        { key: "cashierName", label: "الكاشير" },
        number("refundsCount", "العدد"),
        number("quantity", "الكمية"),
        money("amount", "المبلغ"),
        money("returnedCost", "التكلفة المرتجعة"),
      ],
    },
    {
      title: "المرتجعات",
      rows: d.wasteAndRefunds.refunds,
      columns: [
        date("occurredAt", "التاريخ"),
        { key: "orderNumber", label: "الطلب" },
        { key: "cashierName", label: "الكاشير" },
        { key: "reason", label: "السبب" },
        money("amount", "المبلغ"),
        money("totalCostReturned", "التكلفة المرتجعة"),
      ],
    },
  ];
}
