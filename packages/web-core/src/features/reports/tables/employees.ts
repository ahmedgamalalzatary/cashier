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

export function employeesTables(d: ReportsData): TableData[] {
  return [
    {
      title: "وقت وعمل الكاشير",
      rows: d.employees.activity,
      columns: [
        text("name", "الموظف"),
        number("shiftsCount", "الورديات", { total: true }),
        { key: "workedMinutes", label: "وقت العمل", kind: "minutes", total: true },
        number("ordersCount", "الطلبات", { total: true }),
        money("discounts", "الخصومات", { total: true }),
        number("refundsCount", "المرتجعات", { total: true }),
        number("wasteCount", "الهالك", { total: true }),
        number("expensesCount", "المصروفات", { total: true }),
        number("transferRequestsCount", "طلبات التحويل", { total: true }),
      ],
    },
    {
      title: "الورديات الكاملة المرتبطة بالفترة",
      note: "الأرقام التالية تخص الوردية كاملة حتى وقت تحميل التقرير، وليست مبيعات الفترة فقط. المتوقع يشمل العهدة + المبيعات − المرتجعات − مصروفات الوردية.",
      rows: d.sales.byShift,
      columns: [
        reference("shiftId", "الوردية"),
        text("cashierName", "الكاشير", { filter: true }),
        date("openedAt", "الفتح"),
        date("closedAt", "آخر إغلاق"),
        event("status", "الحالة", "status"),
        money("openingFloat", "العهدة"),
        money("lifetimeSales", "كل المبيعات"),
        money("lifetimeRefunds", "كل المرتجعات"),
        money("lifetimeExpenses", "كل المصروفات"),
        money("expectedCash", "النقد المتوقع عند التسوية"),
        uncountedMoney("actualCash", "النقد الفعلي عند التسوية"),
        uncountedMoney("overShort", "آخر زيادة / عجز"),
      ],
      details: {
        title: "سجل إجراءات الورديات",
        rows: d.employees.shiftHistory,
        columns: [
          date("occurredAt", "التاريخ"),
          reference("shiftId", "الوردية"),
          text("cashierName", "الكاشير", { filter: true }),
          event("action", "الإجراء", "shiftAction"),
          text("actorName", "المنفذ"),
          text("note", "ملاحظات"),
        ],
      },
    },
    {
      title: "سجل المرتبات والسلف والتسويات",
      rows: d.employees.salaryHistory,
      columns: [
        date("occurredAt", "التاريخ"),
        text("employeeName", "الموظف", { filter: true }),
        event("type", "النوع", "salaryHistory"),
        money("amount", "المبلغ"),
        text("periodMonth", "شهر الاستحقاق"),
        text("note", "ملاحظات"),
      ],
    },
  ];
}
