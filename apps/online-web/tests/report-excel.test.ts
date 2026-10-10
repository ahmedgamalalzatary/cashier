import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatMoney } from "@cashier/web-core/lib/format";
import type { ReportExport } from "@cashier/web-core/features/reports-page";
import {
  buildReportWorkbook,
  reportFileName,
  sheetName,
} from "../src/lib/report-excel";

const report: ReportExport = {
  branchName: "فرع الشمال",
  from: "2026-09-01",
  to: "2026-09-10",
  section: "الأموال والمصروفات",
  tables: [
    {
      title: "زيادة / عجز الورديات",
      note: "لقطة تسوية الوردية",
      rows: [{ shiftId: 7, cashierName: "سارة", actualCash: null, overShort: "-5.00" }],
      columns: [
        { key: "shiftId", label: "الوردية", kind: "number" },
        { key: "cashierName", label: "الكاشير" },
        { key: "actualCash", label: "النقد الفعلي", kind: "uncountedMoney" },
        { key: "overShort", label: "الزيادة / العجز", kind: "uncountedMoney" },
      ],
    },
    {
      title: "المصروفات حسب التصنيف",
      rows: [],
      columns: [{ key: "categoryName", label: "التصنيف" }],
    },
  ],
};

const texts = (values: unknown) =>
  (values as unknown[]).filter((value) => value !== undefined);

describe("report Excel file", () => {
  // The first load of exceljs on a cold cache can take several seconds.
  it("puts each table of the tab on its own right-to-left sheet, as the screen shows it", { timeout: 30_000 }, async () => {
    const workbook = await buildReportWorkbook(report);
    const [shifts, expenses] = workbook.worksheets;

    expect(workbook.worksheets).toHaveLength(2);
    expect(shifts.name).toBe(sheetName("زيادة / عجز الورديات", new Set()));
    expect(shifts.views[0]).toMatchObject({ rightToLeft: true });
    const all = shifts
      .getSheetValues()
      .flatMap((row) => (row ? texts(row) : []));
    expect(all).toEqual(
      expect.arrayContaining([
        "فرع الشمال",
        "الفترة: 2026-09-01 — 2026-09-10",
        "الأموال والمصروفات — زيادة / عجز الورديات",
        "لقطة تسوية الوردية",
        "الكاشير",
        "سارة",
        "لم يُعدّ",
        formatMoney("-5.00"),
      ]),
    );
    expect(
      expenses.getSheetValues().flatMap((row) => (row ? texts(row) : [])),
    ).toContain("لا توجد بيانات");
  });

  it("names sheets the way Excel allows: short, unique, without / \\ ? * [ ] :", () => {
    const used = new Set<string>();
    const long = "التحويلات المنفذة من الرئيسي إلى الكافيه";

    const first = sheetName(long, used);
    const second = sheetName(long, used);

    expect(sheetName("زيادة / عجز: [الورديات]?", new Set())).not.toMatch(
      /[\\/?*[\]:]/,
    );
    expect(first.length).toBeLessThanOrEqual(31);
    expect(second.length).toBeLessThanOrEqual(31);
    expect(second).not.toBe(first);
  });

  it("never leaves a sheet without a name", () => {
    const used = new Set<string>();
    expect(sheetName("   ", used)).toBe("جدول");
    expect(sheetName("", used)).toBe("جدول (2)");
  });

  it("names the file after the section and the loaded period", () => {
    expect(reportFileName(report)).toBe(
      "تقرير الأموال والمصروفات 2026-09-01 إلى 2026-09-10.xlsx",
    );
  });

  it("is offered on the online reports page only", () => {
    const online = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/reports/page.tsx"),
      "utf8",
    );
    const staff = fs.readFileSync(
      path.resolve(process.cwd(), "../web/src/app/reports/page.tsx"),
      "utf8",
    );
    expect(online).toContain("excelDownload={downloadReportExcel}");
    expect(staff).not.toContain("excelDownload");
  });
});
