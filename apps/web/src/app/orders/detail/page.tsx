"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { OrderDetail } from "@cashier/shared";
import {
  Banknote,
  Coins,
  Printer,
  RotateCcw,
  Scissors,
  Trash2,
  TriangleAlert,
  User,
} from "lucide-react";
import { useAuth } from "@cashier/web-core/components/auth/auth-provider";
import { OrderReceipt } from "@/components/pos/order-receipt";
import { OrderWasteModal } from "@/components/orders/order-waste-modal";
import { RefundOrderModal } from "@/components/refunds/refund-order-modal";
import { PrintSlip } from "@/components/print/print-slip";
import { Badge } from "@cashier/web-core/components/ui/badge";
import { Button } from "@cashier/web-core/components/ui/button";
import { PageHeader } from "@cashier/web-core/components/ui/page-header";
import { Stat, StatStrip } from "@cashier/web-core/components/ui/stat";
import { Table } from "@cashier/web-core/components/ui/table";
import { ErrorBanner, LoadingState } from "@cashier/web-core/components/ui/states";
import { formatMoney, itemLabel } from "@cashier/web-core/lib/format";
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
    <Suspense fallback={<LoadingState label="جارِ تحميل الطلب…" />}>
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
  const [refunding, setRefunding] = useState(false);
  const [wasting, setWasting] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      if (!id) throw new Error("لم يتم تحديد السجل");
      setOrder(await getOrder(id));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل الطلب");
    }
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (error) return <ErrorBanner>{error}</ErrorBanner>;
  if (!order) return <LoadingState label="جارِ تحميل الطلب…" />;

  const margin = orderMargin(order);
  const atLoss = Number(order.total) < Number(order.totalCost);

  return (
    <div>
      <PageHeader
        back={{ href: "/orders", label: "رجوع إلى الطلبات" }}
        title="الطلب"
        actions={
          <>
            <span className="rounded-lg border border-line bg-surface px-2.5 py-1 text-sm font-bold tnum">
              {order.orderNumber}
            </span>
            {order.refundStatus !== "full" && (
              <Button variant="secondary" onClick={() => setRefunding(true)}>
                <RotateCcw className="size-4" />
                مرتجع
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => setWasting(true)}
            >
              <Trash2 className="size-4" />
              هالك
            </Button>
            <Button onClick={() => window.print()}>
              <Printer className="size-4" />
              طباعة الإيصال
            </Button>
          </>
        }
      />

      {notice && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success"
        >
          {notice}
        </p>
      )}

      {refunding && (
        <RefundOrderModal
          orderId={order.id}
          onClose={() => setRefunding(false)}
          onSaved={(refund) => {
            setRefunding(false);
            setNotice(`تم تسجيل المرتجع بقيمة ${formatMoney(refund.amount)}`);
            void load();
          }}
        />
      )}

      {wasting && (
        <OrderWasteModal
          orderId={order.id}
          title={`هالك من الطلب ${order.orderNumber}`}
          onClose={() => setWasting(false)}
          onSaved={() => {
            setWasting(false);
            setNotice("تم تسجيل الهالك من الكافيه؛ البيع لم يتغيّر.");
          }}
        />
      )}

      <StatStrip className="mb-6">
        <Stat
          icon={<Coins className="size-4" />}
          label="المطلوب"
          value={formatMoney(order.total)}
        />
        <Stat
          icon={<Scissors className="size-4" />}
          label="الخصم"
          value={
            Number(order.discountAmount) > 0
              ? formatMoney(order.discountAmount)
              : "—"
          }
        />
        <Stat
          icon={<Banknote className="size-4" />}
          label="المستلم / الباقي"
          value={`${formatMoney(order.cashReceived)} · ${formatMoney(order.changeAmount)}`}
        />
        <Stat
          icon={<User className="size-4" />}
          label="الكاشير"
          value={order.cashierName}
        />
      </StatStrip>

      {order.isAdminSale && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-line bg-surface p-3 text-sm">
          <Badge tone="neutral">إداري</Badge>
          بيع إداري — بدون وردية
        </p>
      )}

      {order.isNegativeStock && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          <TriangleAlert className="size-4 shrink-0" />
          سُجّل هذا البيع مع رصيد مخزون سالب، يحتاج مراجعة إدارية.
        </p>
      )}

      <section className="mb-6 grid gap-4 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
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
            "المرتجع",
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
              <td className="tnum px-4 py-3">{quantity(line.quantity)}</td>
              <td className="tnum px-4 py-3">
                {Number(line.refundedQuantity) > 0 ? (
                  <span>
                    {quantity(line.refundedQuantity)} من{" "}
                    {quantity(line.quantity)}
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td className="tnum px-4 py-3 text-muted">
                {formatMoney(line.unitPrice)}
              </td>
              <td className="tnum px-4 py-3 font-bold">
                {formatMoney(line.lineSubtotal)}
              </td>
              {isAdmin && (
                <td className="tnum px-4 py-3 text-muted">
                  {formatMoney(line.totalCost ?? "0.00")}
                </td>
              )}
            </tr>
          ))}
        </Table>
      </div>

      {order.refunds.length > 0 && (
        <div className="mb-6 rounded-xl border border-line p-4">
          <p className="text-sm font-medium">
            مرتجعات هذا الطلب
            {Number(order.refundedAmount) > 0 && (
              <span className="tnum text-muted">
                {" "}
                — <b className="tnum text-danger">
                  {formatMoney(order.refundedAmount)}
                </b>{" "}
                مستردة
              </span>
            )}
          </p>
          <ul className="mt-2 space-y-1.5">
            {order.refunds.map((refund) => (
              <li key={refund.id} className="text-sm">
                <Link
                  href={`/refunds?refund=${refund.id}`}
                  className="font-medium text-primary underline"
                >
                  مرتجع {dateTime.format(new Date(refund.createdAt))}
                </Link>
                <span className="tnum text-muted">
                  {" "}
                  — {formatMoney(refund.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                    <td className="tnum px-4 py-3">
                      {quantity(allocation.quantity)}
                    </td>
                    <td className="tnum px-4 py-3 text-muted">
                      {formatMoney(allocation.unitCost ?? "0.00")}
                    </td>
                    <td className="tnum px-4 py-3">
                      {formatMoney(allocation.lineCost)}
                    </td>
                  </tr>
                )),
              )}
            </Table>
          ) : (
            <p className="empty-state text-sm text-muted">
              لم تُسحب أي كمية من المخزون لهذا الطلب.
            </p>
          )}
        </>
      )}

      {/* the receipt itself is the print artifact; PrintSlip hides the page
          behind it from the printer so it cannot feed blank paper */}
      <PrintSlip>
        <OrderReceipt order={order} />
      </PrintSlip>
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
