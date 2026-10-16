import type { ReportTable as TableData } from "../../../models/reports-model";
import type { ReportsData } from "../../../services/reports-service";
import {
  date,
  event,
  money,
  number,
  reference,
  text,
  uncountedMoney,
} from "../report-columns";

export function moneyTables(d: ReportsData): TableData[] {
  const figures = d.overview.current;
  return [
    {
      title: "صافي الربح",
      note: "صافي الربح = مجمل الربح − المصروفات − تكلفة الهالك − المرتبات والسلف المصروفة خلال الفترة.",
      rows: [
        { label: "صافي المبيعات", amount: figures.netSales },
        { label: "صافي تكلفة المبيعات", amount: figures.cost - figures.returnedCost },
        { label: "مجمل الربح", amount: figures.grossProfit },
        { label: "المصروفات", amount: -figures.expenses },
        { label: "تكلفة الهالك", amount: -figures.wasteCost },
        { label: "المرتبات والسلف المصروفة", amount: -figures.salaries },
        { label: "صافي الربح", amount: figures.netProfit },
      ],
      columns: [text("label", "البند"), money("amount", "المبلغ")],
    },
    {
      title: "المصروفات حسب التصنيف",
      rows: d.money.expenseBreakdown,
      columns: [
        text("categoryName", "التصنيف"),
        number("entriesCount", "العدد", { total: true }),
        money("amount", "الإجمالي", { total: true }),
      ],
      details: {
        title: "تفاصيل المصروفات",
        rows: d.money.expenses,
        columns: [
          reference("id", "المستند"),
          date("expenseDate", "التاريخ"),
          text("categoryName", "التصنيف", { filter: true }),
          event("type", "النوع", "expenseType"),
          reference("shiftId", "الوردية"),
          money("amount", "المبلغ", { total: true }),
          text("recordedByName", "المسجل", { filter: true }),
          text("note", "ملاحظات"),
        ],
      },
    },
    {
      title: "التدفق النقدي",
      rows: d.money.cashFlow,
      columns: [
        date("occurredAt", "التاريخ"),
        event("type", "النوع", "cashFlow"),
        reference("referenceId", "المرجع", {
          labelKey: "reference",
          documentKey: "type",
        }),
        money("amount", "المبلغ", { total: true }),
      ],
    },
    {
      title: "زيادة / عجز الورديات",
      note: "أحداث الإغلاق والتصحيح التي حدثت خلال الفترة. المبالغ لقطة تسوية الوردية كاملة عند كل حدث؛ ليست حركة نقدية إضافية ولا تجمع الأحداث المتكررة للوردية نفسها.",
      rows: d.money.shiftOverShort,
      columns: [
        reference("shiftId", "الوردية"),
        text("cashierName", "الكاشير", { filter: true }),
        date("occurredAt", "التاريخ"),
        event("action", "الإجراء", "shiftAction"),
        money("expectedCash", "النقد المتوقع"),
        uncountedMoney("actualCash", "النقد الفعلي"),
        uncountedMoney("overShort", "الزيادة / العجز"),
        text("actorName", "المنفذ"),
        text("note", "ملاحظات"),
      ],
    },
  ];
}
