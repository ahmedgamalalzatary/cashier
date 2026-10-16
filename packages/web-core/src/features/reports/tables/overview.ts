import type { ReportTable as TableData } from "../../../models/reports-model";
import { percentChange } from "../../../models/reports-model";
import { reportCellText } from "../../../models/report-cell";
import type {
  PeriodFigures,
  ReportsData,
} from "../../../services/reports-service";
import { money, number, text } from "../report-columns";

/** The overview's headline figures, in the order the cards show them. */
export const overviewFigures: {
  key: keyof PeriodFigures;
  label: string;
  kind: "money" | "number" | "percent";
  /** A rise is bad news for costs, so the arrow's colour flips. */
  lowerIsBetter?: true;
}[] = [
  { key: "netSales", label: "صافي المبيعات", kind: "money" },
  { key: "ordersCount", label: "عدد الطلبات", kind: "number" },
  { key: "averageOrder", label: "متوسط الطلب", kind: "money" },
  { key: "grossProfit", label: "مجمل الربح", kind: "money" },
  { key: "margin", label: "هامش الربح %", kind: "percent" },
  { key: "expenses", label: "المصروفات", kind: "money", lowerIsBetter: true },
  { key: "wasteCost", label: "تكلفة الهالك", kind: "money", lowerIsBetter: true },
  { key: "salaries", label: "المرتبات والسلف المصروفة", kind: "money", lowerIsBetter: true },
  { key: "netProfit", label: "صافي الربح", kind: "money" },
];

const topRows = (rows: ReportsData["overview"]["topBySales"]) =>
  rows.map((row, index) => ({
    rank: index + 1,
    productName: row.productName,
    sizeName: row.sizeName,
    value: row.value,
  }));

/** What the overview shows, as tables for the Excel download. */
export function overviewTables(d: ReportsData): TableData[] {
  const { current, previous } = d.overview;
  return [
    {
      title: "المؤشرات مقارنة بالفترة السابقة",
      note: `الفترة السابقة: ${previous.from} — ${previous.to}`,
      rows: overviewFigures.map(({ key, label, kind }) => ({
        label,
        // figures of different kinds share a column, so each is shown as text
        current: reportCellText({ value: current[key] }, { key: "value", label, kind }),
        previous: reportCellText({ value: previous[key] }, { key: "value", label, kind }),
        change:
          current[key] == null || previous[key] == null
            ? null
            : percentChange(current[key], previous[key]),
      })),
      columns: [
        text("label", "المؤشر"),
        text("current", "الفترة"),
        text("previous", "الفترة السابقة"),
        { key: "change", label: "التغير %", kind: "percent" },
      ],
    },
    {
      title: "المبيعات حسب الساعة",
      rows: d.overview.byHour.map((row) => ({
        hour: `${row.hour}:00`,
        sales: row.sales,
        ordersCount: row.ordersCount,
      })),
      columns: [
        text("hour", "الساعة"),
        money("sales", "المبيعات", { total: true }),
        number("ordersCount", "الطلبات", { total: true }),
      ],
    },
    {
      title: "أعلى ٥ منتجات مبيعًا",
      rows: topRows(d.overview.topBySales),
      columns: [
        number("rank", "الترتيب"),
        text("productName", "المنتج"),
        text("sizeName", "الحجم"),
        money("value", "صافي المبيعات"),
      ],
    },
    {
      title: "أعلى ٥ منتجات ربحًا",
      rows: topRows(d.overview.topByProfit),
      columns: [
        number("rank", "الترتيب"),
        text("productName", "المنتج"),
        text("sizeName", "الحجم"),
        money("value", "مجمل الربح"),
      ],
    },
  ];
}
