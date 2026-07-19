import type { Item, PurchaseUnitMode } from "@cashier/shared";
import type { PurchaseCreateBody } from "@/services/purchases-service";

export type PurchaseLineForm = {
  key: number;
  itemId: string;
  quantity: string;
  unitMode: PurchaseUnitMode;
  unitPrice: string;
};

const BIGINT_ZERO = BigInt(0);
const BIGINT_TEN = BigInt(10);
const HALF_MILLI = BigInt(500);
const MILLI_PER_UNIT = BigInt(1_000);

export function newPurchaseLine(key: number): PurchaseLineForm {
  return { key, itemId: "", quantity: "", unitMode: "stock", unitPrice: "" };
}

function decimalToScaled(value: string, scale: number) {
  const match = value.trim().match(/^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if (!match) return BIGINT_ZERO;
  const whole = match[1];
  const fraction = match[2] ?? "";
  const exponent = Number(match[3] ?? 0);
  const digits = BigInt(`${whole}${fraction}` || "0");
  const decimalPlaces = fraction.length - exponent;
  if (decimalPlaces <= scale) {
    return digits * BIGINT_TEN ** BigInt(scale - decimalPlaces);
  }
  return digits / BIGINT_TEN ** BigInt(decimalPlaces - scale);
}

function lineTotalCents(line: PurchaseLineForm) {
  const quantityMilli = decimalToScaled(line.quantity, 3);
  const unitPriceCents = decimalToScaled(line.unitPrice, 2);
  return (quantityMilli * unitPriceCents + HALF_MILLI) / MILLI_PER_UNIT;
}

export function purchaseLineAmounts(line: PurchaseLineForm, item?: Item) {
  const quantity = Number(line.quantity) || 0;
  const factor =
    line.unitMode === "purchase" ? Number(item?.purchaseToStockFactor ?? 0) : 1;
  return {
    stockQuantity: quantity * factor,
    lineTotal: Number(lineTotalCents(line)) / 100,
  };
}

export function purchaseTotal(lines: PurchaseLineForm[]) {
  return (
    Number(
      lines.reduce((total, line) => total + lineTotalCents(line), BIGINT_ZERO),
    ) / 100
  );
}

export function purchaseRequestBody(input: {
  supplierId: string;
  invoiceNumber: string;
  purchasedAt: string;
  paidAmount: number;
  notes: string;
  lines: PurchaseLineForm[];
}): PurchaseCreateBody {
  return {
    supplierId: Number(input.supplierId),
    invoiceNumber: input.invoiceNumber.trim() || null,
    purchasedAt: input.purchasedAt,
    paidAmount: input.paidAmount,
    notes: input.notes.trim() || null,
    lines: input.lines.map((line) => ({
      itemId: Number(line.itemId),
      quantity: Number(line.quantity),
      unitMode: line.unitMode,
      unitPrice: Number(line.unitPrice),
    })),
  };
}
