import { testId } from "@cashier/shared/test-support";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportTable } from "../../src/components/reports/report-table";
import { tables } from "../../src/features/reports/report-tables";
import { tabs } from "../../src/features/reports/report-tabs";
import type {
  Column,
  ReportTable as TableData,
} from "../../src/models/reports-model";
import type { ReportRow } from "../../src/services/reports-service";
import { reportsFixture } from "../fixtures/reports";

/** Every table of every tab, details included. */
function everyTable() {
  const all: TableData[] = [];
  const visit = (table: TableData) => {
    all.push(table);
    if (table.details) visit(table.details);
  };
  for (const [tab] of tabs) tables(reportsFixture(), tab).forEach(visit);
  return all;
}

/** A row the way the API sends it: IDs are UUIDs, figures are decimals. */
function apiRow(columns: Column[]): ReportRow {
  const row: ReportRow = {};
  for (const column of columns) {
    const value = /(^id$|Id$)/.test(column.key)
      ? testId(0xabcdef)
      : column.kind === "date"
        ? "2026-09-10T08:00:00Z"
        : column.kind && column.kind !== "event" && column.kind !== "warehouse"
          ? "12.50"
          : "نص";
    row[column.key] = value;
    if (column.labelKey) row[column.labelKey] = null;
  }
  return row;
}

describe("report tables", () => {
  it("never shows a document ID as a broken number or a raw UUID", () => {
    for (const table of everyTable()) {
      const html = renderToStaticMarkup(
        <ReportTable {...table} rows={[apiRow(table.columns)]} />,
      );
      expect(html, table.title).not.toContain("ليس رقمًا");
      expect(html, table.title).not.toContain(testId(0xabcdef));
    }
  });

  it("shows the returned cost by day, so each row adds up to its profit", () => {
    const byDay = everyTable().find((table) => table.title === "حسب اليوم")!;
    const keys = byDay.columns.map((column) => column.key);
    expect(keys).toEqual(
      expect.arrayContaining(["sales", "refunds", "cost", "returnedCost", "profit"]),
    );
    for (const row of byDay.rows)
      expect(
        Number(row.sales) -
          Number(row.refunds) -
          Number(row.cost) +
          Number(row.returnedCost),
      ).toBeCloseTo(Number(row.profit), 2);
  });
});

describe("report tabs", () => {
  it("are the six owner-approved sections, overview first", () => {
    expect(tabs.map(([, label]) => label)).toEqual([
      "نظرة عامة",
      "المبيعات",
      "المخزون",
      "المصروفات والأرباح",
      "الموظفون والورديات",
      "الموردون",
    ]);
  });

  it("keep every table of the old seven tabs", () => {
    const titles = everyTable().map((table) => table.title);
    for (const title of [
      "حسب اليوم",
      "حسب المنتج",
      "حسب التصنيف",
      "مبيعات الورديات خلال الفترة",
      "حسب الكاشير",
      "المخزون الحالي وقيمة FIFO",
      "قائمة المخزون المنخفض والسالب",
      "دفتر حركة المخزون",
      "سجل فروقات الجرد والتسويات",
      "التدفق النقدي",
      "المصروفات حسب التصنيف",
      "تفاصيل المصروفات",
      "زيادة / عجز الورديات",
      "وقت وعمل الكاشير",
      "الورديات الكاملة المرتبطة بالفترة",
      "سجل إجراءات الورديات",
      "سجل المرتبات والسلف والتسويات",
      "ملخص الهالك",
      "الهالك",
      "ملخص المرتجعات",
      "المرتجعات",
      "ملخص أرصدة الموردين",
      "المشتريات حسب المورد",
      "أصناف فواتير المشتريات",
      "دفعات الموردين",
      "التحويلات المنفذة من الرئيسي إلى الكافيه",
      "أصناف التحويلات المنفذة",
      "طلبات التحويل",
      "أصناف طلبات التحويل",
      "تحضير الوصفات",
      "المكونات المستهلكة في التحضير",
    ])
      expect(titles, title).toContain(title);
    // a title is a table's identity on screen and in Excel, so none repeats
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("fold the raw ledgers under their summaries", () => {
    const detailsOf = (title: string) =>
      everyTable().find((table) => table.title === title)?.details?.title;
    expect(detailsOf("المخزون الحالي وقيمة FIFO")).toBe("دفتر حركة المخزون");
    expect(detailsOf("التحويلات المنفذة من الرئيسي إلى الكافيه")).toBe(
      "أصناف التحويلات المنفذة",
    );
    expect(detailsOf("طلبات التحويل")).toBe("أصناف طلبات التحويل");
    expect(detailsOf("تحضير الوصفات")).toBe("المكونات المستهلكة في التحضير");
  });

  it("put refunds under sales, and waste, transfers and preparations under stock", () => {
    const titlesOf = (tab: (typeof tabs)[number][0]) =>
      tables(reportsFixture(), tab).map((table) => table.title);
    expect(titlesOf("sales")).toContain("ملخص المرتجعات");
    expect(titlesOf("stock")).toEqual(
      expect.arrayContaining([
        "ملخص الهالك",
        "التحويلات المنفذة من الرئيسي إلى الكافيه",
        "تحضير الوصفات",
      ]),
    );
  });

  it("show work time in hours and a profit margin for products and categories", () => {
    const data = reportsFixture();
    data.employees.activity = [{ name: "سارة", workedMinutes: 450 }];
    data.sales.byProduct = [
      { productName: "لاتيه", sales: "200.00", refunds: "0.00", profit: "50.00" },
    ];
    data.sales.byCategory = [
      { category: "مشروبات", sales: "0.00", refunds: "0.00", profit: "0.00" },
    ];
    const find = (tab: (typeof tabs)[number][0], title: string) =>
      tables(data, tab).find((table) => table.title === title)!;
    const html = (table: TableData) => renderToStaticMarkup(<ReportTable {...table} />);

    expect(html(find("employees", "وقت وعمل الكاشير"))).toContain("٧ س ٣٠ د");
    expect(html(find("sales", "حسب المنتج"))).toContain("هامش الربح %");
    expect(html(find("sales", "حسب المنتج"))).toContain("٢٥٪");
    // no net sales, no margin to show
    expect(find("sales", "حسب التصنيف").rows[0]!.margin).toBeNull();
  });
});
