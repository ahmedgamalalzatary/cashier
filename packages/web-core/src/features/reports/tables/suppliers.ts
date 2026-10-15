import type { ReportTable as TableData } from "../../../models/reports-model";
import type { ReportsData } from "../../../services/reports-service";
import { date, money, number } from "../report-columns";

export function suppliersTables(d: ReportsData): TableData[] {
  return [
    {
      title: "ملخص أرصدة الموردين",
      note: "رصيد حالي يشمل الرصيد الافتتاحي وجميع المشتريات والمدفوعات، وليس رصيد نهاية الفترة المختارة.",
      rows: d.suppliers.summary,
      columns: [
        { key: "name", label: "المورد" },
        money("openingBalance", "الرصيد الافتتاحي"),
        money("purchases", "المشتريات"),
        money("payments", "المدفوعات"),
        money("balance", "الرصيد"),
      ],
    },
    {
      title: "المشتريات حسب المورد",
      rows: d.suppliers.purchases,
      columns: [
        date("purchasedAt", "التاريخ"),
        { key: "supplierName", label: "المورد" },
        { key: "invoiceNumber", label: "رقم الفاتورة" },
        money("totalAmount", "الإجمالي"),
        money("paidAmount", "المدفوع"),
        { key: "createdByName", label: "المسجل" },
        { key: "notes", label: "ملاحظات" },
      ],
    },
    {
      title: "أصناف فواتير المشتريات",
      rows: d.suppliers.purchaseLines,
      columns: [
        number("invoiceId", "الفاتورة"),
        date("purchasedAt", "التاريخ"),
        { key: "supplierName", label: "المورد" },
        { key: "itemName", label: "الصنف" },
        number("stockQuantity", "كمية المخزون"),
        { key: "stockUnit", label: "الوحدة" },
        money("unitCost", "تكلفة الوحدة"),
        money("lineTotal", "الإجمالي"),
      ],
    },
    {
      title: "دفعات الموردين",
      rows: d.suppliers.payments,
      columns: [
        date("paidAt", "التاريخ"),
        { key: "supplierName", label: "المورد" },
        money("amount", "المبلغ"),
        number("purchaseInvoiceId", "الفاتورة المرتبطة"),
        { key: "notes", label: "ملاحظات" },
      ],
    },
  ];
}
