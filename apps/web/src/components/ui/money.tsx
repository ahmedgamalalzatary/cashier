import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Money is always tabular so figures line up as columns. */
export function Money({
  value,
  className,
  dir = "auto",
}: {
  value: string | number;
  className?: string;
  dir?: "auto" | "ltr" | "rtl";
}) {
  return (
    <span dir={dir} className={cn("tnum", className)}>
      {formatMoney(value)}
    </span>
  );
}

/** Quantities use the same tabular alignment as money. */
export function Qty({
  value,
  unit,
  className,
}: {
  value: string | number;
  unit?: string;
  className?: string;
}) {
  return (
    <span className={cn("tnum", className)}>
      {Number(value).toLocaleString("ar-EG", { maximumFractionDigits: 3 })}
      {unit ? ` ${unit}` : ""}
    </span>
  );
}
