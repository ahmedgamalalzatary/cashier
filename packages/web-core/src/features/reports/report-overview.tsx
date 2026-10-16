import { AlertTriangle, ArrowDown, ArrowUp, Minus } from "lucide-react";
import { reportCellText } from "../../models/report-cell";
import { percentChange } from "../../models/reports-model";
import type {
  PeriodFigures,
  ReportsData,
  TopProduct,
} from "../../services/reports-service";
import type { Tab } from "./report-tabs";
import { overviewFigures } from "./tables/overview";

const figureText = (
  value: number | null,
  kind: "money" | "number" | "percent",
) => reportCellText({ value }, { key: "value", label: "", kind });
const arabic = new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 1 });

/** How a figure moved against the previous period, for one KPI card. */
export function figureChange(
  key: keyof PeriodFigures,
  current: PeriodFigures,
  previous: PeriodFigures,
  lowerIsBetter = false,
) {
  const now = current[key],
    before = previous[key];
  if (now == null || before == null) return null;
  // Margin is already a percentage: its change is in points, not % of %.
  const change =
    key === "margin" ? Math.round((now - before) * 10) / 10 : percentChange(now, before);
  if (change == null) return null;
  const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";
  return {
    direction,
    good: direction === "flat" ? null : (direction === "up") !== lowerIsBetter,
    text: `${arabic.format(Math.abs(change))}${key === "margin" ? " نقطة" : "٪"}`,
  } as const;
}

function KpiCard({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change: ReturnType<typeof figureChange>;
}) {
  const Icon =
    change?.direction === "up" ? ArrowUp : change?.direction === "down" ? ArrowDown : Minus;
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="tnum mt-1 text-xl font-bold">{value}</p>
      <p
        className={`mt-1 flex items-center gap-1 text-xs ${
          change?.good === true
            ? "text-success"
            : change?.good === false
              ? "text-danger"
              : "text-muted"
        }`}
      >
        {change ? (
          <>
            <Icon className="size-3.5" aria-hidden />
            <span>
              {change.direction === "up"
                ? "زيادة"
                : change.direction === "down"
                  ? "انخفاض"
                  : "بدون تغيير"}{" "}
              {change.direction === "flat" ? "" : change.text} عن الفترة السابقة
            </span>
          </>
        ) : (
          "لا توجد بيانات سابقة للمقارنة"
        )}
      </p>
    </div>
  );
}

/**
 * A single-series bar chart in inline SVG: no chart library, prints as is.
 * Each bar names its own value on hover; the table tabs hold the figures.
 */
export function BarChart({
  title,
  bars,
  labelEvery = 1,
}: {
  title: string;
  bars: { label: string; value: number; hint: string }[];
  labelEvery?: number;
}) {
  const width = 640,
    height = 200,
    top = 16,
    bottom = 28,
    plot = height - top - bottom;
  const max = Math.max(0, ...bars.map((bar) => bar.value)),
    min = Math.min(0, ...bars.map((bar) => bar.value)),
    span = max - min || 1,
    zero = top + (max / span) * plot,
    slot = width / Math.max(bars.length, 1),
    barWidth = Math.max(2, Math.min(28, slot - 2));
  return (
    <figure className="break-inside-avoid rounded-xl border border-line bg-surface p-4">
      <figcaption className="mb-2 text-sm font-semibold">{title}</figcaption>
      {bars.length ? (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={title}
          className="h-auto w-full"
        >
          <line
            x1={0}
            x2={width}
            y1={zero}
            y2={zero}
            className="stroke-line"
            strokeWidth={1}
          />
          {bars.map((bar, index) => {
            const size = (Math.abs(bar.value) / span) * plot,
              // RTL: the first bar sits on the right, as the page reads.
              x = width - (index + 1) * slot + (slot - barWidth) / 2,
              y = bar.value >= 0 ? zero - size : zero,
              r = Math.min(4, barWidth / 2, size);
            const path =
              bar.value >= 0
                ? `M${x},${zero}V${y + r}Q${x},${y} ${x + r},${y}H${x + barWidth - r}Q${x + barWidth},${y} ${x + barWidth},${y + r}V${zero}Z`
                : `M${x},${zero}V${y + size - r}Q${x},${y + size} ${x + r},${y + size}H${x + barWidth - r}Q${x + barWidth},${y + size} ${x + barWidth},${y + size - r}V${zero}Z`;
            return (
              <g key={bar.label}>
                <path
                  d={size ? path : ""}
                  className={bar.value >= 0 ? "fill-primary" : "fill-danger"}
                >
                  <title>{bar.hint}</title>
                </path>
                {/* a wider, invisible target so thin bars are easy to hover */}
                <rect x={width - (index + 1) * slot} y={top} width={slot} height={plot} fill="transparent">
                  <title>{bar.hint}</title>
                </rect>
                {index % labelEvery === 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={height - 8}
                    textAnchor="middle"
                    className="fill-muted text-[11px]"
                  >
                    {bar.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      ) : (
        <p className="empty-state text-sm text-muted">لا توجد مبيعات في هذه الفترة</p>
      )}
    </figure>
  );
}

function TopList({ title, rows }: { title: string; rows: TopProduct[] }) {
  return (
    <section className="break-inside-avoid rounded-xl border border-line bg-surface p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {rows.length ? (
        <ol className="space-y-1.5 text-sm">
          {rows.map((row, index) => (
            <li key={`${row.productName}-${row.sizeName}`} className="flex justify-between gap-3">
              <span>
                <span className="tnum text-muted">{arabic.format(index + 1)}. </span>
                {row.productName}
                {row.sizeName && <span className="text-muted"> ({row.sizeName})</span>}
              </span>
              <span className="tnum font-medium">{figureText(row.value, "money")}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">لا توجد بيانات</p>
      )}
    </section>
  );
}

const dayLabel = new Intl.DateTimeFormat("ar-EG", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export function ReportOverview({
  data,
  onOpenTab,
}: {
  data: ReportsData;
  onOpenTab: (tab: Tab) => void;
}) {
  const { current, previous, byHour, topBySales, topByProfit, alerts } =
    data.overview;
  const days = data.sales.byDay.map((row) => {
    const value = Number(row.sales ?? 0) - Number(row.refunds ?? 0);
    return {
      label: dayLabel.format(new Date(`${row.day}T12:00:00Z`)),
      value,
      hint: `${reportCellText(row, { key: "day", label: "", kind: "date" })}: ${figureText(value, "money")}`,
    };
  });
  const hours = byHour.map((row) => ({
    label: arabic.format(row.hour),
    value: row.sales,
    hint: `الساعة ${arabic.format(row.hour)}: ${figureText(row.sales, "money")} — ${arabic.format(row.ordersCount)} طلب`,
  }));
  const alertCards = [
    { count: alerts.negativeStock, label: "أصناف رصيدها بالسالب", tab: "stock" as const },
    { count: alerts.lowStock, label: "أصناف وصلت لحد التنبيه", tab: "stock" as const },
    { count: alerts.overShort, label: "إغلاقات ورديات بزيادة أو عجز", tab: "money" as const },
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
        {overviewFigures.map(({ key, label, kind, lowerIsBetter }) => (
          <KpiCard
            key={key}
            label={label}
            value={figureText(current[key], kind)}
            change={figureChange(key, current, previous, lowerIsBetter)}
          />
        ))}
      </div>
      <p className="text-xs text-muted">
        صافي الربح = مجمل الربح − المصروفات − تكلفة الهالك − المرتبات والسلف
        المصروفة. المقارنة مع الفترة السابقة بنفس عدد الأيام ({previous.from} —{" "}
        {previous.to}).
      </p>
      <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
        <BarChart
          title="صافي المبيعات حسب اليوم"
          bars={days}
          labelEvery={Math.ceil(days.length / 12)}
        />
        <BarChart
          title="المبيعات حسب الساعة (أوقات الذروة)"
          bars={hours.some((hour) => hour.value) ? hours : []}
          labelEvery={2}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TopList title="أعلى ٥ منتجات مبيعًا" rows={topBySales} />
        <TopList title="أعلى ٥ منتجات ربحًا" rows={topByProfit} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {alertCards.map((alert) => (
          <button
            key={alert.label}
            type="button"
            onClick={() => onOpenTab(alert.tab)}
            className={`flex items-center gap-3 rounded-xl border p-4 text-start ${
              alert.count ? "border-danger/40 bg-danger/5" : "border-line bg-surface"
            }`}
          >
            <AlertTriangle
              className={`size-5 shrink-0 ${alert.count ? "text-danger" : "text-muted"}`}
              aria-hidden
            />
            <span>
              <span className="tnum block text-lg font-bold">
                {arabic.format(alert.count)}
              </span>
              <span className="text-sm text-muted">{alert.label}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
