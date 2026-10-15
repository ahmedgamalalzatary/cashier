import type { ReportTable as TableData } from "../../../models/reports-model";
import type { ReportsData } from "../../../services/reports-service";
import { date, money, number } from "../report-columns";

export function operationsTables(d: ReportsData): TableData[] {
  return [
    {
      title: "التحويلات المنفذة من الرئيسي إلى الكافيه",
      rows: d.operations.transfers,
      columns: [
        number("id", "التحويل"),
        date("occurredAt", "التاريخ"),
        number("requestId", "الطلب"),
        number("itemCount", "عدد الأصناف"),
        money("totalCost", "التكلفة المنقولة"),
        { key: "createdByName", label: "المسجل" },
        { key: "approvedByName", label: "المعتمد" },
        { key: "notes", label: "ملاحظات" },
      ],
    },
    {
      title: "أصناف التحويلات المنفذة",
      rows: d.operations.transferLines,
      columns: [
        number("transferId", "التحويل"),
        date("occurredAt", "التاريخ"),
        { key: "itemName", label: "الصنف" },
        number("quantity", "الكمية"),
        { key: "stockUnit", label: "الوحدة" },
        money("totalCost", "التكلفة"),
      ],
    },
    {
      title: "طلبات التحويل",
      note: "الطلبات المنشأة خلال الفترة مع حالتها الحالية وقت تحميل التقرير.",
      rows: d.operations.requests,
      columns: [
        number("id", "الطلب"),
        date("createdAt", "الإنشاء"),
        { key: "status", label: "الحالة", kind: "event", labelSet: "status" },
        number("itemCount", "عدد الأصناف"),
        { key: "requestedByName", label: "الطالب" },
        { key: "reviewedByName", label: "المراجع" },
        date("reviewedAt", "المراجعة"),
        { key: "rejectionReason", label: "سبب الرفض" },
        { key: "notes", label: "ملاحظات" },
      ],
    },
    {
      title: "أصناف طلبات التحويل",
      rows: d.operations.requestLines,
      columns: [
        number("requestId", "الطلب"),
        { key: "itemName", label: "الصنف" },
        number("quantity", "الكمية"),
        { key: "stockUnit", label: "الوحدة" },
      ],
    },
    {
      title: "تحضير الوصفات",
      rows: d.operations.preparations,
      columns: [
        number("id", "التحضير"),
        date("occurredAt", "التاريخ"),
        { key: "recipeName", label: "الوصفة" },
        { key: "outputItemName", label: "الصنف المنتج" },
        number("producedQuantity", "الكمية المنتجة"),
        { key: "stockUnit", label: "الوحدة" },
        money("totalCost", "التكلفة"),
        { key: "preparedByName", label: "المحضر" },
        { key: "notes", label: "ملاحظات" },
      ],
    },
    {
      title: "المكونات المستهلكة في التحضير",
      rows: d.operations.ingredients,
      columns: [
        number("preparationId", "التحضير"),
        { key: "itemName", label: "المكون" },
        number("quantity", "الكمية"),
        { key: "stockUnit", label: "الوحدة" },
        money("totalCost", "التكلفة"),
      ],
    },
  ];
}
