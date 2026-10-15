import type { ReportTable as TableData } from "../../../models/reports-model";
import type { ReportsData } from "../../../services/reports-service";
import { date, money, number, uncountedMoney } from "../report-columns";

export function moneyTables(d: ReportsData): TableData[] {
  return [
    {
      title: "التدفق النقدي",
      rows: d.money.cashFlow,
      columns: [
        date("occurredAt", "التاريخ"),
        { key: "type", label: "النوع", kind: "event", labelSet: "cashFlow" },
        { key: "reference", label: "المرجع" },
        money("amount", "المبلغ"),
      ],
    },
    {
      title: "المصروفات حسب التصنيف",
      rows: d.money.expenseBreakdown,
      columns: [
        { key: "categoryName", label: "التصنيف" },
        number("entriesCount", "العدد"),
        money("amount", "الإجمالي"),
      ],
    },
    {
      title: "تفاصيل المصروفات",
      rows: d.money.expenses,
      columns: [
        number("id", "المستند"),
        date("expenseDate", "التاريخ"),
        { key: "categoryName", label: "التصنيف" },
        {
          key: "type",
          label: "النوع",
          kind: "event",
          labelSet: "expenseType",
        },
        number("shiftId", "الوردية"),
        money("amount", "المبلغ"),
        { key: "recordedByName", label: "المسجل" },
        { key: "note", label: "ملاحظات" },
      ],
    },
    {
      title: "زيادة / عجز الورديات",
      note: "أحداث الإغلاق والتصحيح التي حدثت خلال الفترة. المبالغ لقطة تسوية الوردية كاملة عند كل حدث؛ ليست حركة نقدية إضافية ولا تجمع الأحداث المتكررة للوردية نفسها.",
      rows: d.money.shiftOverShort,
      columns: [
        number("shiftId", "الوردية"),
        { key: "cashierName", label: "الكاشير" },
        date("occurredAt", "التاريخ"),
        {
          key: "action",
          label: "الإجراء",
          kind: "event",
          labelSet: "shiftAction",
        },
        money("expectedCash", "النقد المتوقع"),
        uncountedMoney("actualCash", "النقد الفعلي"),
        uncountedMoney("overShort", "الزيادة / العجز"),
        { key: "actorName", label: "المنفذ" },
        { key: "note", label: "ملاحظات" },
      ],
    },
  ];
}
