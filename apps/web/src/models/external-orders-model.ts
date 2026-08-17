import type {
  ExternalOrderStatus,
  ExternalOrderSummary,
  ExternalOrderType,
  ExternalPaymentMethod,
  ExternalPaymentStatus,
} from "@cashier/shared";
import { formatMoney, sumDecimalValues } from "../lib/format";

export type ExternalOrderFilters = {
  query: string;
  day: string;
};

export function filterExternalOrders(
  orders: ExternalOrderSummary[],
  filters: ExternalOrderFilters,
) {
  const query = filters.query.trim().toLocaleLowerCase("ar");
  return orders.filter((order) => {
    if (filters.day && order.createdAt.slice(0, 10) !== filters.day)
      return false;
    if (!query) return true;
    return (
      String(order.id).includes(query) ||
      order.customerName.toLocaleLowerCase("ar").includes(query) ||
      order.customerPhone?.includes(query) === true
    );
  });
}

const arabicNumber = new Intl.NumberFormat("ar-EG");

export function externalOrdersTotals(orders: ExternalOrderSummary[]) {
  return {
    count: orders.length,
    countLabel: arabicNumber.format(orders.length),
    sales: formatMoney(
      sumDecimalValues(orders.map((order) => order.totalAmount)),
    ),
    discounts: formatMoney(
      sumDecimalValues(orders.map((order) => order.discountAmount)),
    ),
    pending: orders.filter((order) => order.orderStatus === "pending").length,
  };
}

type BadgeTone = "success" | "danger" | "neutral";

const orderStatus: Record<
  ExternalOrderStatus,
  { label: string; tone: BadgeTone }
> = {
  pending: { label: "قيد التنفيذ", tone: "neutral" },
  completed: { label: "مكتمل", tone: "success" },
  cancelled: { label: "ملغي", tone: "danger" },
  unknown: { label: "غير معروف", tone: "neutral" },
};

const paymentStatus: Record<
  ExternalPaymentStatus,
  { label: string; tone: BadgeTone }
> = {
  pending: { label: "الدفع معلق", tone: "neutral" },
  paid: { label: "مدفوع", tone: "success" },
  failed: { label: "فشل الدفع", tone: "danger" },
  cancelled: { label: "الدفع ملغي", tone: "danger" },
  unpaid: { label: "غير مدفوع", tone: "neutral" },
  unknown: { label: "دفع غير معروف", tone: "neutral" },
};

const orderTypes: Record<ExternalOrderType, string> = {
  pickup: "استلام من الفرع",
  delivery: "توصيل",
  unknown: "غير معروف",
};

const paymentMethods: Record<ExternalPaymentMethod, string> = {
  cash_on_delivery: "الدفع عند الاستلام",
  online: "دفع أونلاين",
  onsite: "دفع في الفرع",
  unknown: "غير معروف",
};

export const externalOrderStatus = (status: ExternalOrderStatus) =>
  orderStatus[status];

export const externalPaymentStatus = (status: ExternalPaymentStatus) =>
  paymentStatus[status];

export const externalOrderTypeLabel = (type: ExternalOrderType) =>
  orderTypes[type];

export const externalPaymentMethodLabel = (method: ExternalPaymentMethod) =>
  paymentMethods[method];
