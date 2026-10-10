"use client";

import { ReportsPage } from "@cashier/web-core/features/reports-page";
import { downloadReportExcel } from "@/lib/report-excel";

export default function Page() {
  return <ReportsPage excelDownload={downloadReportExcel} />;
}
