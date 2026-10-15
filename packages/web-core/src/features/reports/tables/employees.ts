import type { ReportTable as TableData } from "../../../models/reports-model";
import type { ReportsData } from "../../../services/reports-service";
import { date, money, number, uncountedMoney } from "../report-columns";

export function employeesTables(d: ReportsData): TableData[] {
  return [
    {
      title: "وقت وعمل الكاشير",
      rows: d.employees.activity,
      columns: [
        { key: "name", label: "الموظف" },
        number("shiftsCount", "الورديات"),
        number("workedMinutes", "دقائق العمل"),
        number("ordersCount", "الطلبات"),
        money("discounts", "الخصومات"),
        number("refundsCount", "المرتجعات"),
        number("wasteCount", "الهالك"),
        number("expensesCount", "المصروفات"),
        number("transferRequestsCount", "طلبات التحويل"),
      ],
    },
    {
      title: "الورديات الكاملة المرتبطة بالفترة",
      note: "الأرقام التالية تخص الوردية كاملة حتى وقت تحميل التقرير، وليست مبيعات الفترة فقط. المتوقع يشمل العهدة + المبيعات − المرتجعات − مصروفات الوردية.",
      rows: d.sales.byShift,
      columns: [
        number("shiftId", "الوردية"),
        { key: "cashierName", label: "الكاشير" },
        date("openedAt", "الفتح"),
        date("closedAt", "آخر إغلاق"),
        { key: "status", label: "الحالة", kind: "event", labelSet: "status" },
        money("openingFloat", "العهدة"),
        money("lifetimeSales", "كل المبيعات"),
        money("lifetimeRefunds", "كل المرتجعات"),
        money("lifetimeExpenses", "كل المصروفات"),
        money("expectedCash", "النقد المتوقع عند التسوية"),
        uncountedMoney("actualCash", "النقد الفعلي عند التسوية"),
        uncountedMoney("overShort", "آخر زيادة / عجز"),
      ],
    },
    {
      title: "سجل إجراءات الورديات",
      rows: d.employees.shiftHistory,
      columns: [
        date("occurredAt", "التاريخ"),
        number("shiftId", "الوردية"),
        { key: "cashierName", label: "الكاشير" },
        {
          key: "action",
          label: "الإجراء",
          kind: "event",
          labelSet: "shiftAction",
        },
        { key: "actorName", label: "المنفذ" },
        { key: "note", label: "ملاحظات" },
      ],
    },
    {
      title: "سجل المرتبات والسلف والتسويات",
      rows: d.employees.salaryHistory,
      columns: [
        date("occurredAt", "التاريخ"),
        { key: "employeeName", label: "الموظف" },
        {
          key: "type",
          label: "النوع",
          kind: "event",
          labelSet: "salaryHistory",
        },
        money("amount", "المبلغ"),
        { key: "periodMonth", label: "شهر الاستحقاق" },
        { key: "note", label: "ملاحظات" },
      ],
    },
  ];
}
