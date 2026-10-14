"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  PurchaseInvoiceDetail,
  PurchaseInvoiceJourney,
} from "@cashier/shared";
import { PageHeader } from "@cashier/web-core/components/ui/page-header";
import { Stat, StatStrip } from "@cashier/web-core/components/ui/stat";
import { Table } from "@cashier/web-core/components/ui/table";
import { EmptyState, ErrorBanner, LoadingState } from "@cashier/web-core/components/ui/states";
import { formatMoney, itemLabel } from "@cashier/web-core/lib/format";
import {
  journeyCostSegments,
  type JourneyCostSegment,
} from "@/models/invoice-journey-model";
import { getPurchase, getPurchaseJourney } from "@/services/purchases-service";

const SEGMENT_COLORS: Record<JourneyCostSegment["key"], string> = {
  sold: "bg-success",
  wasted: "bg-danger",
  shortage: "bg-danger/60",
  mainStock: "bg-primary",
  cafeStock: "bg-accent",
  preparedStock: "bg-primary/50",
};

const quantity = (value: string) =>
  Number(value).toLocaleString("ar-EG", { maximumFractionDigits: 3 });

export default function PurchaseJourneyPage() {
  return (
    <Suspense fallback={<LoadingState label="جارِ تتبع الفاتورة…" />}>
      <PurchaseJourneyView />
    </Suspense>
  );
}

function PurchaseJourneyView() {
  const id = useSearchParams().get("id");
  const [invoice, setInvoice] = useState<PurchaseInvoiceDetail | null>(null);
  const [journey, setJourney] = useState<PurchaseInvoiceJourney | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (!id) throw new Error("لم يتم تحديد السجل");
        const [invoiceRow, journeyRow] = await Promise.all([
          getPurchase(id),
          getPurchaseJourney(id),
        ]);
        if (cancelled) return;
        setInvoice(invoiceRow);
        setJourney(journeyRow);
        setError("");
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "تعذر تتبع فاتورة الشراء",
          );
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <ErrorBanner>{error}</ErrorBanner>;
  if (!invoice || !journey) return <LoadingState label="جارِ تتبع الفاتورة…" />;

  const { totals } = journey;
  const segments = journeyCostSegments(totals);
  const stillInStock =
    Number(totals.mainStockCost) +
    Number(totals.cafeStockCost) +
    Number(totals.preparedStockCost);
  const lost = Number(totals.wastedCost) + Number(totals.shortageCost);
  const unmatched = journey.lines.filter(
    (line) => Number(line.unmatchedSaleQuantity) > 0,
  );

  return (
    <div>
      <PageHeader
        back={{
          href: `/purchases/detail?id=${invoice.id}`,
          label: "رجوع إلى الفاتورة",
        }}
        title={`رحلة الفاتورة ${invoice.invoiceNumber || `#${invoice.id}`}`}
        description={`${invoice.supplierName} · ${invoice.purchasedAt} — أين ذهبت البضاعة، وبكم بيعت، وكم ربحت.`}
      />

      <StatStrip className="mb-5">
        <Stat label="تكلفة الشراء" value={formatMoney(totals.boughtCost)} />
        <Stat
          label="صافي المبيعات"
          value={formatMoney(
            Number(totals.salesAmount) - Number(totals.refundedAmount),
          )}
          hint={
            Number(totals.refundedAmount) > 0
              ? `بعد مرتجعات ${formatMoney(totals.refundedAmount)}`
              : undefined
          }
        />
        <Stat
          label="الربح"
          value={formatMoney(totals.profit)}
          tone={Number(totals.profit) < 0 ? "danger" : "default"}
          hint={`تكلفة المُباع ${formatMoney(totals.soldCost)}`}
        />
        <Stat label="ما زال بالمخزون" value={formatMoney(stillInStock)} />
        <Stat
          label="هالك وعجز"
          value={formatMoney(lost)}
          tone={lost > 0 ? "danger" : "default"}
        />
      </StatStrip>

      <section className="sheet mb-5 p-4">
        <h2 className="mb-3 text-sm font-semibold">أين ذهبت تكلفة الفاتورة</h2>
        {segments.length === 0 ? (
          <p className="text-sm text-muted">لا توجد تكلفة لهذه الفاتورة.</p>
        ) : (
          <>
            <div
              className="flex h-4 overflow-hidden rounded-full bg-line/50"
              role="img"
              aria-label={segments
                .map((segment) => `${segment.label} ${segment.percent}%`)
                .join("، ")}
            >
              {segments.map((segment) => (
                <span
                  key={segment.key}
                  className={SEGMENT_COLORS[segment.key]}
                  style={{ width: `${Math.max(segment.percent, 0)}%` }}
                />
              ))}
            </div>
            <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {segments.map((segment) => (
                <li key={segment.key} className="flex items-center gap-2">
                  <span
                    className={`size-3 shrink-0 rounded-full ${SEGMENT_COLORS[segment.key]}`}
                    aria-hidden
                  />
                  <span>{segment.label}</span>
                  <span className="tnum ms-auto font-medium">
                    {formatMoney(segment.cost)}
                  </span>
                  <span className="tnum w-14 text-end text-xs text-muted">
                    {segment.percent.toLocaleString("ar-EG")}%
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {unmatched.length > 0 && (
        <p className="mb-5 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
          توجد مبيعات تمت بدون رصيد في الكافيه ولم تُطابق بمخزون بعد (
          {unmatched
            .map(
              (line) =>
                `${line.itemName}: ${quantity(line.unmatchedSaleQuantity)} ${line.stockUnit}`,
            )
            .join("، ")}
          ). ستُحسب على أول مخزون يصل للكافيه.
        </p>
      )}

      <h2 className="mb-2 text-sm font-semibold">حسب الصنف</h2>
      {journey.lines.length === 0 ? (
        <EmptyState
          title="لا توجد أصناف"
          description="لم تُستلم أصناف بهذه الفاتورة."
        />
      ) : (
        <Table
          caption="رحلة أصناف الفاتورة"
          headers={[
            "الصنف",
            "المشترى",
            "المُباع",
            "المبيعات",
            "الربح",
            "الهالك والعجز",
            "بالمخزن الرئيسي",
            "بالكافيه",
            "داخل أصناف مُحضّرة",
          ]}
        >
          {journey.lines.map((line) => (
            <tr key={line.itemId}>
              <td className="px-4 py-3 font-medium">
                {itemLabel(line.itemCode, line.itemName)}
              </td>
              <QuantityCost
                quantity={line.boughtQuantity}
                unit={line.stockUnit}
                cost={line.boughtCost}
              />
              <QuantityCost
                quantity={line.soldQuantity}
                unit={line.stockUnit}
                cost={line.soldCost}
              />
              <td className="tnum px-4 py-3">
                {formatMoney(line.salesAmount)}
                {Number(line.refundedAmount) > 0 && (
                  <span className="block text-xs text-muted">
                    مرتجع {formatMoney(line.refundedAmount)}
                  </span>
                )}
              </td>
              <td
                className={`tnum px-4 py-3 font-medium ${Number(line.profit) < 0 ? "text-danger" : ""}`}
              >
                {formatMoney(line.profit)}
              </td>
              <QuantityCost
                quantity={(
                  Number(line.wastedQuantity) + Number(line.shortageQuantity)
                ).toFixed(3)}
                unit={line.stockUnit}
                cost={(
                  Number(line.wastedCost) + Number(line.shortageCost)
                ).toFixed(2)}
              />
              <QuantityCost
                quantity={line.mainStockQuantity}
                unit={line.stockUnit}
                cost={line.mainStockCost}
              />
              <QuantityCost
                quantity={line.cafeStockQuantity}
                unit={line.stockUnit}
                cost={line.cafeStockCost}
              />
              <QuantityCost
                quantity={line.preparedStockQuantity}
                unit={line.stockUnit}
                cost={line.preparedStockCost}
              />
            </tr>
          ))}
        </Table>
      )}

      <h2 className="mb-2 mt-6 text-sm font-semibold">بيعت داخل</h2>
      {journey.products.length === 0 ? (
        <EmptyState
          title="لم يُبع شيء بعد"
          description="عند بيع منتجات تحتوي على أصناف هذه الفاتورة ستظهر هنا."
        />
      ) : (
        <Table
          caption="المنتجات التي بيعت فيها أصناف الفاتورة"
          headers={[
            "المنتج",
            "صنف الفاتورة",
            "الكمية المستخدمة",
            "التكلفة",
            "المبيعات",
            "المرتجع",
            "الربح",
          ]}
        >
          {journey.products.map((product) => {
            const line = journey.lines.find(
              (candidate) => candidate.itemId === product.itemId,
            );
            return (
              <tr
                key={`${product.itemId}-${product.productName}-${product.sizeName}-${product.viaItemName}`}
              >
                <td className="px-4 py-3 font-medium">
                  {product.productName}
                  {product.sizeName && (
                    <span className="text-muted"> · {product.sizeName}</span>
                  )}
                  {product.viaItemName && (
                    <span className="block text-xs text-muted">
                      عبر {product.viaItemName}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{line?.itemName ?? "—"}</td>
                <td className="tnum px-4 py-3">
                  {quantity(product.quantity)} {line?.stockUnit}
                </td>
                <td className="tnum px-4 py-3">{formatMoney(product.cost)}</td>
                <td className="tnum px-4 py-3">
                  {formatMoney(product.salesAmount)}
                </td>
                <td className="tnum px-4 py-3 text-muted">
                  {formatMoney(product.refundedAmount)}
                </td>
                <td
                  className={`tnum px-4 py-3 font-medium ${Number(product.profit) < 0 ? "text-danger" : ""}`}
                >
                  {formatMoney(product.profit)}
                </td>
              </tr>
            );
          })}
        </Table>
      )}

      <p className="mt-4 text-xs text-muted">
        مبيعات كل صنف = نصيبه من سعر البيع الفعلي بنسبة تكلفته داخل المنتج.
        الكميات بوحدة مخزون صنف الفاتورة.
      </p>
    </div>
  );
}

function QuantityCost({
  quantity: amount,
  unit,
  cost,
}: {
  quantity: string;
  unit: string;
  cost: string;
}) {
  return (
    <td className="tnum px-4 py-3">
      {quantity(amount)} {unit}
      <span className="block text-xs text-muted">{formatMoney(cost)}</span>
    </td>
  );
}
