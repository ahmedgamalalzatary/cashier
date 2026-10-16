import type { ReportTable as TableData } from "../../../models/reports-model";
import type { ReportsData } from "../../../services/reports-service";
import { date, money, number, reference, text } from "../report-columns";

export function suppliersTables(d: ReportsData): TableData[] {
  return [
    {
      title: "ملخص أرصدة الموردين",
      note: "رصيد حالي يشمل الرصيد الافتتاحي وجميع المشتريات والمدفوعات، وليس رصيد نهاية الفترة المختارة.",
      rows: d.suppliers.summary,
      columns: [
        text("name", "المورد"),
        money("openingBalance", "الرصيد الافتتاحي", { total: true }),
        money("purchases", "المشتريات", { total: true }),
        money("payments", "المدفوعات", { total: true }),
        money("balance", "الرصيد", { total: true }),
      ],
    },
    {
      title: "المشتريات حسب المورد",
      rows: d.suppliers.purchases,
      columns: [
        date("purchasedAt", "التاريخ"),
        text("supplierName", "المورد", { filter: true }),
        reference("id", "رقم الفاتورة", {
          labelKey: "invoiceNumber",
          document: "purchase",
        }),
        money("totalAmount", "الإجمالي", { total: true }),
        money("paidAmount", "المدفوع", { total: true }),
        text("createdByName", "المسجل"),
        text("notes", "ملاحظات"),
      ],
      details: {
        title: "أصناف فواتير المشتريات",
        rows: d.suppliers.purchaseLines,
        columns: [
          reference("invoiceId", "الفاتورة", {
            labelKey: "invoiceNumber",
            document: "purchase",
          }),
          date("purchasedAt", "التاريخ"),
          text("supplierName", "المورد", { filter: true }),
          text("itemName", "الصنف"),
          number("stockQuantity", "كمية المخزون"),
          text("stockUnit", "الوحدة"),
          money("unitCost", "تكلفة الوحدة"),
          money("lineTotal", "الإجمالي", { total: true }),
        ],
      },
    },
    {
      title: "دفعات الموردين",
      rows: d.suppliers.payments,
      columns: [
        date("paidAt", "التاريخ"),
        text("supplierName", "المورد", { filter: true }),
        money("amount", "المبلغ", { total: true }),
        reference("purchaseInvoiceId", "الفاتورة المرتبطة", {
          labelKey: "purchaseInvoiceNumber",
          document: "purchase",
        }),
        text("notes", "ملاحظات"),
      ],
    },
  ];
}
