import type {
  CurrentShift,
  InventoryStockRow,
  Role,
  Shift,
  Supplier,
  TransferRequestSummary,
} from "@cashier/shared";
import { cairoCalendarDate } from "../lib/cairo-date";
import { formatMoney, sumDecimalValues } from "../lib/format";

const arabicPlural = new Intl.PluralRules("ar-EG");
const arabicNumber = new Intl.NumberFormat("ar-EG");

/**
 * Arabic counts change the noun, not just a plural "s": one صنف, two صنفان,
 * three-to-ten أصناف, eleven-plus صنفًا. The number is dropped for one and two
 * because the noun already carries it.
 */
export type CountForms = {
  one: string;
  two: string;
  few: string;
  many: string;
  other: string;
};

export function countPhrase(count: number, forms: CountForms) {
  const rule = arabicPlural.select(count);
  if (rule === "one") return forms.one;
  if (rule === "two") return forms.two;
  const noun =
    rule === "few" ? forms.few : rule === "many" ? forms.many : forms.other;
  return `${arabicNumber.format(count)} ${noun}`;
}

export const ITEM_COUNT: CountForms = {
  one: "صنف واحد",
  two: "صنفان",
  few: "أصناف",
  many: "صنفًا",
  other: "صنف",
};

export const SHIFT_COUNT: CountForms = {
  one: "وردية واحدة",
  two: "ورديتان",
  few: "ورديات",
  many: "وردية",
  other: "وردية",
};

const REQUEST_COUNT: CountForms = {
  one: "طلب تحويل واحد",
  two: "طلبا تحويل",
  few: "طلبات تحويل",
  many: "طلب تحويل",
  other: "طلب تحويل",
};

const SUPPLIER_COUNT: CountForms = {
  one: "مورد واحد",
  two: "موردان",
  few: "موردين",
  many: "موردًا",
  other: "مورد",
};

export function greetingFor(hour: number) {
  if (hour < 5) return "سهرة سعيدة";
  if (hour < 12) return "صباح الخير";
  if (hour < 17) return "نهارك سعيد";
  return "مساء الخير";
}

/** The drawer the signed-in user may look inside, if any. */
export function openShiftOf(current: CurrentShift | null) {
  return current && !("occupied" in current) ? current : null;
}

/** True when another cashier holds the drawer and its figures stay hidden. */
export function drawerIsBusy(current: CurrentShift | null) {
  return Boolean(current && "occupied" in current);
}

export function workedLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours
    ? `${arabicNumber.format(hours)} س ${arabicNumber.format(rest)} د`
    : `${arabicNumber.format(rest)} دقيقة`;
}

export type TapeLine = { label: string; value: string };

export function shiftTapeLines(shift: Shift): TapeLine[] {
  return [
    { label: "العهدة الافتتاحية", value: formatMoney(shift.openingFloat) },
    { label: "المبيعات", value: formatMoney(shift.totals.sales) },
    // Its own line, never "المبيعات · ٣٧ طلبًا": a separator sitting against
    // Arabic-Indic digits reads as another digit.
    { label: "الطلبات", value: arabicNumber.format(shift.totals.ordersCount) },
    { label: "الخصومات", value: formatMoney(shift.totals.discounts) },
    { label: "المرتجعات", value: formatMoney(shift.totals.refunds) },
    { label: "مصروفات الدرج", value: formatMoney(shift.totals.expenses) },
  ];
}

export type DayTape = {
  shiftCount: number;
  lines: TapeLine[];
};

/**
 * Totals for the shifts opened on a Cairo calendar day. The server scopes the
 * shift list to the signed-in cashier, so this reads as "your day" for a
 * cashier and "the floor" for an admin without branching.
 */
export function dayTape(shifts: Shift[], day = cairoCalendarDate()): DayTape {
  const todays = shifts.filter(
    (shift) => cairoCalendarDate(new Date(shift.openedAt)) === day,
  );
  const orders = todays.reduce(
    (sum, shift) => sum + shift.totals.ordersCount,
    0,
  );
  return {
    shiftCount: todays.length,
    lines: [
      {
        label: "المبيعات",
        value: formatMoney(
          sumDecimalValues(todays.map((shift) => shift.totals.sales)),
        ),
      },
      { label: "الطلبات", value: arabicNumber.format(orders) },
      {
        label: "المصروفات",
        value: formatMoney(
          sumDecimalValues(todays.map((shift) => shift.totals.expenses)),
        ),
      },
    ],
  };
}

export type AttentionTone = "danger" | "warn" | "info";

export type AttentionItem = {
  id: string;
  label: string;
  href: string;
  tone: AttentionTone;
};

export type AttentionInput = {
  role: Role;
  mainStock: InventoryStockRow[];
  cafeStock: InventoryStockRow[];
  requests: TransferRequestSummary[];
  suppliers: Supplier[];
};

const lowStockCount = (rows: InventoryStockRow[]) =>
  rows.filter((row) => row.isActive && row.isLowStock).length;

const negativeStockCount = (rows: InventoryStockRow[]) =>
  rows.filter((row) => row.isNegativeStock).length;

/**
 * Only what someone can act on today, worst first. Counts live inside the
 * label so nothing is stated twice.
 */
export function attentionItems({
  role,
  mainStock,
  cafeStock,
  requests,
  suppliers,
}: AttentionInput): AttentionItem[] {
  const pending = requests.filter(
    (request) => request.status === "pending",
  ).length;
  const owed = suppliers.filter((supplier) => Number(supplier.balance) > 0);
  const candidates: Array<AttentionItem & { count: number }> = [
    {
      id: "cafe-negative",
      count: negativeStockCount(cafeStock),
      label: `${countPhrase(negativeStockCount(cafeStock), ITEM_COUNT)} برصيد سالب في الكافيه`,
      href: "/cafe",
      tone: "danger",
    },
    {
      id: "main-negative",
      count: negativeStockCount(mainStock),
      label: `${countPhrase(negativeStockCount(mainStock), ITEM_COUNT)} برصيد سالب في المخزن الرئيسي`,
      href: "/warehouse",
      tone: "danger",
    },
    {
      id: "transfers",
      count: pending,
      label: `${countPhrase(pending, REQUEST_COUNT)} ${
        role === "admin" ? "بانتظار موافقتك" : "بانتظار موافقة المدير"
      }`,
      href: "/cafe",
      tone: role === "admin" ? "warn" : "info",
    },
    {
      id: "cafe-low",
      count: lowStockCount(cafeStock),
      label: `${countPhrase(lowStockCount(cafeStock), ITEM_COUNT)} تحت حد التنبيه في الكافيه`,
      href: "/cafe",
      tone: "warn",
    },
    {
      id: "main-low",
      count: lowStockCount(mainStock),
      label: `${countPhrase(lowStockCount(mainStock), ITEM_COUNT)} تحت حد التنبيه في المخزن الرئيسي`,
      href: "/warehouse",
      tone: "warn",
    },
    {
      id: "supplier-dues",
      count: owed.length,
      label: `${countPhrase(owed.length, SUPPLIER_COUNT)} برصيد مستحق ${formatMoney(
        sumDecimalValues(owed.map((supplier) => supplier.balance)),
      )}`,
      href: "/suppliers",
      tone: "info",
    },
  ];
  const order: AttentionTone[] = ["danger", "warn", "info"];
  return candidates
    .filter((item) => item.count > 0)
    .sort((a, b) => order.indexOf(a.tone) - order.indexOf(b.tone))
    .map((item) => ({
      id: item.id,
      label: item.label,
      href: item.href,
      tone: item.tone,
    }));
}
