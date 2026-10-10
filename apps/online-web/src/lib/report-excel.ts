import type { Workbook } from "exceljs";
import { reportCellText } from "@cashier/web-core/components/reports/report-table";
import type { ReportExport } from "@cashier/web-core/features/reports-page";

/** Loaded on click only, so the reports page itself stays light. */
async function loadExcel() {
  // exceljs is CommonJS: its classes sit on the default export.
  const loaded = (await import("exceljs")) as unknown as {
    default: typeof import("exceljs");
  };
  return loaded.default;
}

/** Excel refuses names over 31 characters, repeated, or with \ / ? * [ ] : */
export function sheetName(title: string, used: Set<string>) {
  const base =
    title.replace(/[\\/?*[\]:]/g, "-").trim().slice(0, 31) || "جدول";
  let name = base;
  for (let copy = 2; used.has(name); copy++) {
    const suffix = ` (${copy})`;
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(name);
  return name;
}

export function reportFileName(report: ReportExport) {
  return `تقرير ${report.section} ${report.from} إلى ${report.to}.xlsx`;
}

/** One right-to-left sheet per table, with the same text the screen shows. */
export async function buildReportWorkbook(
  report: ReportExport,
): Promise<Workbook> {
  const { Workbook } = await loadExcel();
  const workbook = new Workbook();
  const used = new Set<string>();
  for (const table of report.tables) {
    const sheet = workbook.addWorksheet(sheetName(table.title, used), {
      views: [{ rightToLeft: true }],
    });
    sheet.addRow([report.branchName]).font = { bold: true, size: 14 };
    sheet.addRow([`الفترة: ${report.from} — ${report.to}`]);
    sheet.addRow([`${report.section} — ${table.title}`]).font = { bold: true };
    if (table.note) sheet.addRow([table.note]);
    sheet.addRow([]);
    sheet.addRow(table.columns.map((column) => column.label)).font = {
      bold: true,
    };
    if (table.rows.length === 0) sheet.addRow(["لا توجد بيانات"]);
    for (const row of table.rows)
      sheet.addRow(
        table.columns.map((column) =>
          reportCellText(row[column.key], column.kind, column.labelSet),
        ),
      );
    sheet.columns.forEach((column) => {
      column.width = 18;
    });
  }
  return workbook;
}

export async function downloadReportExcel(report: ReportExport) {
  const workbook = await buildReportWorkbook(report);
  const file = new Blob([await workbook.xlsx.writeBuffer()], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = reportFileName(report);
  link.click();
  // The click has handed the file to the browser; the address is no longer needed.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
