import type { ReportTable as TableData } from "../../../models/reports-model";
import type { ReportsData } from "../../../services/reports-service";
import {
  date,
  margin,
  money,
  number,
  reference,
  text,
  withMargin,
} from "../report-columns";

export function salesTables(d: ReportsData): TableData[] {
  return [
    {
      title: "حسب اليوم",
      note: "مجمل الربح = المبيعات − المرتجعات − تكلفة المبيعات + التكلفة المرتجعة. لا تخصم منه المصروفات أو الرواتب أو الهالك.",
      rows: d.sales.byDay,
      columns: [
        date("day", "اليوم"),
        money("sales", "المبيعات", { total: true }),
        money("discounts", "الخصومات", { total: true }),
        money("refunds", "المرتجعات", { total: true }),
        money("cost", "التكلفة", { total: true }),
        money("returnedCost", "التكلفة المرتجعة", { total: true }),
        money("profit", "مجمل الربح", { total: true }),
        number("ordersCount", "الطلبات", { total: true }),
      ],
    },
    {
      title: "حسب المنتج",
      rows: withMargin(d.sales.byProduct),
      columns: [
        text("productName", "المنتج"),
        text("sizeName", "الحجم"),
        number("quantity", "صافي الكمية", { total: true }),
        money("sales", "المبيعات", { total: true }),
        money("refunds", "المرتجعات", { total: true }),
        money("cost", "التكلفة", { total: true }),
        money("profit", "مجمل الربح", { total: true }),
        margin,
      ],
    },
    {
      title: "حسب التصنيف",
      rows: withMargin(d.sales.byCategory),
      columns: [
        text("mainCategory", "الرئيسي", { filter: true }),
        text("category", "الفرعي"),
        money("sales", "المبيعات", { total: true }),
        money("refunds", "المرتجعات", { total: true }),
        money("cost", "التكلفة", { total: true }),
        money("profit", "مجمل الربح", { total: true }),
        margin,
      ],
    },
    {
      title: "حسب الكاشير",
      rows: d.sales.byCashier,
      columns: [
        text("cashierName", "الكاشير"),
        number("ordersCount", "الطلبات", { total: true }),
        money("sales", "المبيعات", { total: true }),
        money("discounts", "الخصومات", { total: true }),
        money("refunds", "المرتجعات", { total: true }),
        money("profit", "مجمل الربح", { total: true }),
      ],
    },
    {
      title: "مبيعات الورديات خلال الفترة",
      note: "المبيعات والخصومات والمرتجعات والتكلفة تخص الفترة المختارة، ولو فتحت الوردية قبلها.",
      rows: d.sales.byShift,
      columns: [
        reference("shiftId", "الوردية"),
        text("cashierName", "الكاشير", { filter: true }),
        date("openedAt", "الفتح"),
        money("sales", "المبيعات", { total: true }),
        money("refunds", "المرتجعات", { total: true }),
        money("discounts", "الخصومات", { total: true }),
        money("cost", "تكلفة المبيعات", { total: true }),
        money("returnedCost", "التكلفة المرتجعة", { total: true }),
        money("profit", "مجمل الربح", { total: true }),
      ],
    },
    {
      title: "ملخص المرتجعات",
      rows: d.wasteAndRefunds.refundSummary,
      columns: [
        text("productName", "المنتج"),
        text("sizeName", "الحجم"),
        text("reason", "السبب"),
        text("cashierName", "الكاشير", { filter: true }),
        number("refundsCount", "العدد", { total: true }),
        number("quantity", "الكمية", { total: true }),
        money("amount", "المبلغ", { total: true }),
        money("returnedCost", "التكلفة المرتجعة", { total: true }),
      ],
      details: {
        title: "المرتجعات",
        rows: d.wasteAndRefunds.refunds,
        columns: [
          date("occurredAt", "التاريخ"),
          reference("id", "المرتجع", { document: "refund" }),
          reference("orderId", "الطلب", {
            labelKey: "orderNumber",
            document: "order",
          }),
          text("cashierName", "الكاشير", { filter: true }),
          text("reason", "السبب"),
          money("amount", "المبلغ", { total: true }),
          money("totalCostReturned", "التكلفة المرتجعة", { total: true }),
        ],
      },
    },
  ];
}
