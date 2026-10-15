import { formatMoney } from "@cashier/web-core/lib/format";

export function Total({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${strong ? "text-base font-bold" : ""}`}
    >
      <span>{label}</span>
      <span className="tnum">{formatMoney(value)}</span>
    </div>
  );
}
