import type { ReportTable as TableData } from "../../../models/reports-model";
import type { ReportsData } from "../../../services/reports-service";
import { date, money, number } from "../report-columns";

export function salesTables(d: ReportsData): TableData[] {
  return [
    {
      title: "حسب اليوم",
      rows: d.sales.byDay,
      columns: [
        { key: "day", label: "اليوم" },
        money("sales", "المبيعات"),
        money("discounts", "الخصومات"),
        money("refunds", "المرتجعات"),
        money("cost", "التكلفة"),
        money("profit", "مجمل الربح"),
        number("ordersCount", "الطلبات"),
      ],
    },
    {
      title: "حسب المنتج",
      rows: d.sales.byProduct,
      columns: [
        { key: "productName", label: "المنتج" },
        { key: "sizeName", label: "الحجم" },
        number("quantity", "صافي الكمية"),
        money("sales", "المبيعات"),
        money("refunds", "المرتجعات"),
        money("cost", "التكلفة"),
        money("profit", "مجمل الربح"),
      ],
    },
    {
      title: "حسب التصنيف",
      rows: d.sales.byCategory,
      columns: [
        { key: "mainCategory", label: "الرئيسي" },
        { key: "category", label: "الفرعي" },
        money("sales", "المبيعات"),
        money("refunds", "المرتجعات"),
        money("cost", "التكلفة"),
        money("profit", "مجمل الربح"),
      ],
    },
    {
      title: "مبيعات الورديات خلال الفترة",
      note: "المبيعات والخصومات والمرتجعات والتكلفة تخص الفترة المختارة، ولو فتحت الوردية قبلها.",
      rows: d.sales.byShift,
      columns: [
        number("shiftId", "الوردية"),
        { key: "cashierName", label: "الكاشير" },
        date("openedAt", "الفتح"),
        money("sales", "المبيعات"),
        money("refunds", "المرتجعات"),
        money("discounts", "الخصومات"),
        money("cost", "تكلفة المبيعات"),
        money("returnedCost", "التكلفة المرتجعة"),
        money("profit", "مجمل الربح"),
      ],
    },
    {
      title: "حسب الكاشير",
      rows: d.sales.byCashier,
      columns: [
        { key: "cashierName", label: "الكاشير" },
        number("ordersCount", "الطلبات"),
        money("sales", "المبيعات"),
        money("discounts", "الخصومات"),
        money("refunds", "المرتجعات"),
        money("profit", "مجمل الربح"),
      ],
    },
  ];
}
