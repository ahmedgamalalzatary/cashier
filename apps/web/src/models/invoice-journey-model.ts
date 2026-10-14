import type { InvoiceJourneyMoney } from "@cashier/shared";

const SEGMENTS = [
  ["sold", "مُباع", "soldCost"],
  ["wasted", "هالك", "wastedCost"],
  ["shortage", "عجز جرد", "shortageCost"],
  ["mainStock", "بالمخزن الرئيسي", "mainStockCost"],
  ["cafeStock", "بالكافيه", "cafeStockCost"],
  ["preparedStock", "داخل أصناف مُحضّرة", "preparedStockCost"],
] as const;

export type JourneyCostSegment = {
  key: (typeof SEGMENTS)[number][0];
  label: string;
  cost: string;
  /** Share of the bought cost, one decimal. */
  percent: number;
};

/** Where the invoice's bought cost is now, as parts of one bar. */
export function journeyCostSegments(
  totals: InvoiceJourneyMoney,
): JourneyCostSegment[] {
  const bought = Number(totals.boughtCost);
  if (!(bought > 0)) return [];
  return SEGMENTS.filter(([, , field]) => Number(totals[field]) !== 0).map(
    ([key, label, field]) => ({
      key,
      label,
      cost: totals[field],
      percent: Math.round((Number(totals[field]) / bought) * 1000) / 10,
    }),
  );
}
