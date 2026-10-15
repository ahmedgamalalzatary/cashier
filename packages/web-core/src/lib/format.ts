const egp = new Intl.NumberFormat("ar-EG", {
  style: "currency",
  currency: "EGP",
  maximumFractionDigits: 2,
});

export function formatMoney(value: number | string) {
  return egp.format(Number(value));
}

/**
 * Cost figures are hidden from cashiers, so the field arrives absent. Show a
 * dash instead of a misleading 0.00 when there is nothing to format.
 */
export function formatOptionalMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined) return "—";
  return formatMoney(value);
}

export function formatItemCode(code: number) {
  return String(code).padStart(4, "0");
}

export function itemLabel(code: number, name: string) {
  return `${formatItemCode(code)} · ${name}`;
}

export function sumDecimalValues(values: string[]) {
  if (values.length === 0) return "0";
  const scale = Math.max(
    ...values.map((value) => value.split(".")[1]?.length ?? 0),
  );
  const factor = BigInt(10) ** BigInt(scale);
  const total = values.reduce((sum, value) => {
    const negative = value.startsWith("-");
    const unsigned = negative ? value.slice(1) : value;
    const [whole, fraction = ""] = unsigned.split(".");
    const scaled =
      BigInt(whole || "0") * factor +
      BigInt(fraction.padEnd(scale, "0") || "0");
    return sum + (negative ? -scaled : scaled);
  }, BigInt(0));
  if (scale === 0) return total.toString();
  const negative = total < BigInt(0);
  const unsigned = negative ? -total : total;
  const digits = unsigned.toString().padStart(scale + 1, "0");
  return `${negative ? "-" : ""}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}
