import type { ReportTable as TableData } from "../../../models/reports-model";
import type { ReportsData } from "../../../services/reports-service";
import { date, money, number } from "../report-columns";

export function stockTables(d: ReportsData): TableData[] {
  return [
    {
      title: "المخزون الحالي وقيمة FIFO",
      note: "الأرصدة الحالية وقت تحميل التقرير؛ لا تمثل رصيد نهاية الفترة المختارة.",
      rows: d.stock.current,
      columns: [
        number("code", "الكود"),
        { key: "name", label: "الصنف" },
        { key: "warehouse", label: "المخزن", kind: "warehouse" },
        number("quantity", "الكمية"),
        { key: "stockUnit", label: "الوحدة" },
        money("stockValue", "القيمة"),
        number("minimumLevel", "حد التنبيه"),
      ],
    },
    {
      title: "قائمة المخزون المنخفض والسالب",
      note: "تنبيهات الأرصدة الحالية وقت تحميل التقرير.",
      rows: d.stock.lowStock,
      columns: [
        number("code", "الكود"),
        { key: "name", label: "الصنف" },
        { key: "warehouse", label: "المخزن", kind: "warehouse" },
        number("quantity", "الكمية"),
        number("minimumLevel", "حد التنبيه"),
      ],
    },
    {
      title: "دفتر حركة المخزون",
      rows: d.stock.ledger,
      columns: [
        date("occurredAt", "التاريخ"),
        number("code", "الكود"),
        { key: "itemName", label: "الصنف" },
        { key: "warehouse", label: "المخزن", kind: "warehouse" },
        {
          key: "movementType",
          label: "الحركة",
          kind: "event",
          labelSet: "movement",
        },
        number("quantity", "الكمية"),
        money("totalCost", "التكلفة"),
        {
          key: "referenceType",
          label: "المرجع",
          kind: "event",
          labelSet: "reference",
        },
        number("referenceId", "رقم المرجع"),
        { key: "notes", label: "ملاحظات" },
      ],
    },
    {
      title: "سجل فروقات الجرد والتسويات",
      rows: d.stock.stocktakes,
      columns: [
        number("id", "المستند"),
        date("createdAt", "التاريخ"),
        {
          key: "kind",
          label: "النوع",
          kind: "event",
          labelSet: "stocktakeKind",
        },
        { key: "warehouse", label: "المخزن", kind: "warehouse" },
        number("lineCount", "الأصناف"),
        number("shortageQuantity", "العجز"),
        number("surplusQuantity", "الزيادة"),
        { key: "createdByName", label: "المسجل" },
        { key: "status", label: "الحالة", kind: "event", labelSet: "status" },
        date("confirmedAt", "التأكيد"),
        { key: "note", label: "ملاحظات" },
      ],
    },
  ];
}
