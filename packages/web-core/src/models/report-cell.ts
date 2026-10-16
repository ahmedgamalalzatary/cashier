import { formatMoney } from "../lib/format";
import type { ReportRow } from "../services/reports-service";
import type { Column } from "./reports-model";

const arabicNumber = new Intl.NumberFormat("ar-EG", {
  maximumFractionDigits: 3,
});
const percent = new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 1 });

/** Worked minutes as the shop reads them, e.g. ٧ س ٣٠ د. */
export function workTime(minutes: number) {
  const hours = Math.floor(minutes / 60),
    rest = Math.round(minutes - hours * 60);
  if (!hours) return `${arabicNumber.format(rest)} د`;
  return rest
    ? `${arabicNumber.format(hours)} س ${arabicNumber.format(rest)} د`
    : `${arabicNumber.format(hours)} س`;
}
const eventLabels: Record<string, string> = {
  sale: "بيع",
  refund: "مرتجع",
  expense: "مصروف",
  supplier_payment: "دفعة مورد",
  purchase: "شراء",
  transfer_out: "تحويل صادر",
  transfer_in: "تحويل وارد",
  order: "بيع",
  waste: "هالك",
  preparation_out: "استهلاك تحضير",
  preparation_in: "إنتاج تحضير",
  refund_return: "إرجاع للمخزون",
  adjustment: "تسوية جرد",
  stocktake_shortage: "عجز جرد",
  stocktake_surplus: "زيادة جرد",
  salary_payment: "صرف راتب",
  salary_advance: "سلفة موظف",
  purchase_invoice: "فاتورة شراء",
  preparation: "تحضير",
  transfer: "تحويل",
  stocktake: "جرد مخزون",
};
// The stocktake document kind shares its vocabulary with nothing else, so it
// gets its own map rather than borrowing the movement/reference labels.
const stocktakeKindLabels: Record<string, string> = {
  stocktake: "جرد مخزون",
  manual: "تسوية يدوية",
};
const salaryHistoryLabels: Record<string, string> = {
  payment: "صرف راتب",
  advance: "سلفة",
  bonus: "مكافأة",
  deduction: "خصم",
};
// Waste stores an enum code in `reason`; a refund stores free-typed text, so
// the same map must never rewrite a refund reason the cashier actually wrote.
const wasteReasonLabels: Record<string, string> = {
  expired: "منتهي الصلاحية",
  damaged: "تالف",
  preparation_mistake: "خطأ تحضير",
  spill: "انسكاب",
  other: "سبب آخر",
};
const labelSets: Record<string, Record<string, string>> = {
  movement: eventLabels,
  reference: eventLabels,
  cashFlow: eventLabels,
  stocktakeKind: stocktakeKindLabels,
  salaryHistory: salaryHistoryLabels,
  wasteReason: wasteReasonLabels,
  status: {
    open: "مفتوحة",
    closed: "مغلقة",
    pending: "قيد المراجعة",
    approved: "معتمد",
    rejected: "مرفوض",
    draft: "مسودة",
    confirmed: "مؤكد",
  },
  shiftAction: {
    open: "فتح",
    close: "إغلاق",
    admin_close: "إغلاق إداري",
    auto_close: "إغلاق تلقائي",
    reopen: "إعادة فتح",
    correction: "تصحيح",
  },
  expenseType: { shift: "مصروف وردية", general: "مصروف عام" },
};
/** A short, readable code for a document that has no number of its own. */
export function shortReference(id: string | number) {
  const text = String(id),
    compact = text.replace(/-/g, "");
  // UUIDv7 starts with the time, so the random tail tells records apart.
  return `#${compact.length > 8 ? compact.slice(-6).toUpperCase() : text}`;
}

/** The text a reference cell shows. */
export function referenceText(row: ReportRow, column: Column) {
  const id = row[column.key];
  if (id == null || id === "") return "—";
  const label = column.labelKey ? row[column.labelKey] : null;
  return label != null && label !== "" ? String(label) : shortReference(id);
}

/** The text a report cell shows; the online Excel download reuses it. */
export function reportCellText(row: ReportRow, column: Column) {
  const { kind, labelSet } = column,
    value = row[column.key] ?? null;
  // uncountedMoney comes first: an auto-closed shift has no counted drawer and
  // must say so rather than fall through to the generic dash.
  if (kind === "uncountedMoney" && (value == null || value === ""))
    return "لم يُعدّ";
  if (value == null || value === "") return "—";
  if (kind === "reference") return referenceText(row, column);
  if (kind === "uncountedMoney" || kind === "money")
    return formatMoney(value);
  if (kind === "number") return arabicNumber.format(Number(value));
  if (kind === "minutes") return workTime(Number(value));
  if (kind === "percent") return `${percent.format(Number(value))}٪`;
  if (kind === "date") {
    const options = { timeZone: "Africa/Cairo" };
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T12:00:00Z`).toLocaleDateString("ar-EG", options)
      : new Date(value).toLocaleString("ar-EG", options);
  }
  if (kind === "warehouse") return value === "main" ? "الرئيسي" : "الكافيه";
  if (kind === "event") {
    const set = labelSet ? labelSets[labelSet] : eventLabels;
    return set?.[String(value)] ?? String(value);
  }
  return String(value);
}
