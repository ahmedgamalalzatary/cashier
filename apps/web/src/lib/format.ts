const egp = new Intl.NumberFormat("ar-EG", {
  style: "currency",
  currency: "EGP",
  maximumFractionDigits: 2,
});

export function formatMoney(value: number | string) {
  return egp.format(Number(value));
}
