import type { ReportTable as TableData } from "../../models/reports-model";
import type { ReportsData } from "../../services/reports-service";
import type { Tab } from "./report-tabs";
import { overviewTables } from "./tables/overview";
import { salesTables } from "./tables/sales";
import { stockTables } from "./tables/stock";
import { moneyTables } from "./tables/money";
import { employeesTables } from "./tables/employees";
import { suppliersTables } from "./tables/suppliers";

export function tables(d: ReportsData, tab: Tab): TableData[] {
  if (tab === "overview") return overviewTables(d);
  if (tab === "sales") return salesTables(d);
  if (tab === "stock") return stockTables(d);
  if (tab === "money") return moneyTables(d);
  if (tab === "employees") return employeesTables(d);
  return suppliersTables(d);
}
