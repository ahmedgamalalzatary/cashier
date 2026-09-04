"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { OrderDetail } from "@cashier/shared";
import {
  ArrowRight,
  Banknote,
  Coins,
  Printer,
  Scissors,
  TriangleAlert,
  User,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { OrderReceipt } from "@/components/pos/order-receipt";
import { Badge } from "@/components/ui/badge";
import { Table } from "@/components/ui/table";
import { formatMoney, itemLabel } from "@/lib/format";
import { orderMargin } from "@/models/orders-model";
import { getOrder } from "@/services/orders-service";

const dateTime = new Intl.DateTimeFormat("ar-EG", {
  dateStyle: "medium",
  timeStyle: "short",
});

const quantity = (value: string | number) =>
  Number(value).toLocaleString("ar-EG", { maximumFractionDigits: 3 });

export default function OrderDetailPage() {
  return (
    <Suspense fallback={<p className="text-muted">جارِ تحميل الطلب…</p>}>
      <OrderDetailView />
    </Suspense>
  );
}

function OrderDetailView() {
  const id = useSearchParams().get("id");
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getOrder(Number(id))
      .then(setOrder)
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "تعذر تحميل الطلب"),
      );
  }, [id]);

  if (error)
    return (
      <p
        role="alert"
        className="rounded-lg bg-danger/10 p-3 text-sm text-danger"
      >
        {error}
      </p>
    );
  if (!order) return <p className="text-muted">جارِ تحميل الطلب…</p>;

  const margin = orderMargin(order);
  const atLoss = Number(order.total) < Number(order.totalCost);

  return (
    <div>
      <Link
        href="/orders"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
      >
        <ArrowRight className="size-4" /> رجوع إلى الطلبات
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">الطلب</h1>
          <span className="rounded-lg border border-line bg-surface px-2.5 py-1 text-sm font-bold tnum">
            {order.orderNumber}
          </span>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-strong"
        >
          <Printer className="size-4" />
          طباعة الإيصال
        </button>
      </div>

      <section className="mb-6 overflow-hidden rounded-2xl border border-line bg-sidebar text-white shadow-[0_16px_45px_rgb(43_33_24/0.10)]">
        <div className="grid divide-y divide-white/10 sm:grid-cols-2 sm:divide-x sm:divide-x-reverse sm:divide-y-0 lg:grid-cols-4">
          <Summary
            icon={<Coins className="size-5 text-accent" />}
            label="المطلوب"
            value={formatMoney(order.total)}
          />
          <Summary
            icon={<Scissors className="size-5 text-accent" />}
            label="الخصم"
            value={
              Number(order.discountAmount) > 0
                ? formatMoney(order.discountAmount)
                : "—"
            }
          />
          <Summary
            icon={<Banknote className="size-5 text-accent" />}
            label="المستلم / الباقي"
            value={`${formatMoney(order.cashReceived)} · ${formatMoney(order.changeAmount)}`}
          />
          <Summary
            icon={<User className="size-5 text-accent" />}
            label="الكاشير"
            value={order.cashierName}
          />
        </div>
      </section>

      {order.isNegativeStock && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          <TriangleAlert className="size-4 shrink-0" />
          سُجّل هذا البيع مع رصيد مخزون سالب، يحتاج مراجعة إدارية.
        </p>
      )}

      <section className="mb-6 grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact
          label="وقت البيع"
          value={dateTime.format(new Date(order.createdAt))}
          numeric
        />
        <Fact
          label="الإجمالي قبل الخصم"
          value={formatMoney(order.subtotal)}
          numeric
        />
        <Fact
          label="الحالة"
          value={order.isNegativeStock ? "رصيد سالب" : "مكتمل"}
          badge={order.isNegativeStock ? "danger" : "success"}
        />
        {isAdmin && <Fact label="التكلفة" value={margin.cost} numeric />}
        {isAdmin && (
          <Fact
            label="الربح"
            value={margin.profit}
            numeric
            tone={atLoss ? "text-danger" : "text-success"}
          />
        )}
      </section>

      <h2 className="mb-3 font-bold">أصناف الطلب</h2>
      <div className="mb-6">
        <Table
          headers={[
            "الصنف",
            "الكمية",
            "سعر الوحدة",
            "الإجمالي",
            ...(isAdmin ? ["التكلفة"] : []),
          ]}
        >
          {order.lines.map((line) => (
            <tr key={line.id}>
              <td className="px-4 py-3">
                <span className="font-medium">{line.productName}</span>
                <span className="block text-xs text-muted">
                  {line.sizeName ?? "صنف مباشر"}
                </span>
                {line.modifiers.map((modifier) => (
                  <span key={modifier.id} className="block text-xs text-muted">
                    + {modifier.optionName} × {quantity(modifier.quantity)}
                  </span>
                ))}
              </td>
              <td className="px-4 py-3 tnum">{quantity(line.quantity)}</td>
              <td className="px-4 py-3 tnum text-muted">
                {formatMoney(line.unitPrice)}
              </td>
              <td className="px-4 py-3 tnum font-bold">
                {formatMoney(line.lineSubtotal)}
              </td>
              {isAdmin && (
                <td className="px-4 py-3 tnum text-muted">
                  {formatMoney(line.totalCost)}
                </td>
              )}
            </tr>
          ))}
        </Table>
      </div>

      {isAdmin && (
        <>
          <h2 className="mb-3 font-bold">ما خرج من المخزون</h2>
          {order.lines.some((line) => line.allocations.length > 0) ? (
            <Table
              headers={["الصنف", "الكمية المسحوبة", "تكلفة الوحدة", "التكلفة"]}
            >
              {order.lines.flatMap((line) =>
                line.allocations.map((allocation) => (
                  <tr key={allocation.id}>
                    <td className="px-4 py-3">
                      {itemLabel(allocation.itemCode, allocation.itemName)}
                    </td>
                    <td className="px-4 py-3 tnum">
                      {quantity(allocation.quantity)}
                    </td>
                    <td className="px-4 py-3 tnum text-muted">
                      {formatMoney(allocation.unitCost)}
                    </td>
                    <td className="px-4 py-3 tnum">
                      {formatMoney(allocation.lineCost)}
                    </td>
                  </tr>
                )),
              )}
            </Table>
          ) : (
            <p className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-muted">
              لم تُسحب أي كمية من المخزون لهذا الطلب.
            </p>
          )}
        </>
      )}

      {/* the receipt itself is the print artifact; on screen the tables above
          say the same thing with room to read */}
      <div className="hidden print:block">
        <OrderReceipt order={order} />
      </div>
    </div>
  );
}

function Summary({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <div className="rounded-lg bg-white/8 p-2">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-sidebar-ink">{label}</p>
        <p className="tnum mt-0.5 truncate text-xl font-bold">{value}</p>
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  numeric = false,
  tone = "",
  badge,
}: {
  label: string;
  value: string;
  numeric?: boolean;
  tone?: string;
  badge?: "success" | "danger";
}) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      {badge ? (
        <p className="mt-1">
          <Badge tone={badge}>{value}</Badge>
        </p>
      ) : (
        <p
          className={`mt-1 font-medium ${numeric ? "tnum" : ""} ${tone}`}
          dir={numeric ? "auto" : undefined}
        >
          {value}
        </p>
      )}
    </div>
  );
}
