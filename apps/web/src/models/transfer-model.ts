import type { InventoryStockRow, PurchaseInvoiceLine } from "@cashier/shared";
import type { TransferRequestBody } from "@/services/transfers-service";

export type TransferLineForm = {
  key: number;
  itemId: string;
  quantity: string;
};

/** one transferable item derived from a purchase invoice */
export type InvoiceTransferRow = {
  itemId: number;
  code: number;
  name: string;
  stockUnit: string;
  invoiceQuantity: number;
  availableQuantity: number;
  quantity: string;
  /** the invoice bought more than is left in the main warehouse */
  clamped: boolean;
  /** the item was deactivated after this invoice; the API would reject it */
  inactive: boolean;
  selected: boolean;
};

// quantities are stored with three decimals; trim the float noise a sum leaves
const roundQuantity = (value: number) => Number(value.toFixed(3));

export function invoiceTransferRows(
  lines: PurchaseInvoiceLine[],
  mainStock: InventoryStockRow[],
): InvoiceTransferRow[] {
  const available = new Map(mainStock.map((row) => [row.itemId, row]));
  const merged = new Map<number, InvoiceTransferRow>();
  for (const line of lines) {
    // an invoice may bill the same item twice (different units or prices),
    // but a transfer accepts each item once
    const existing = merged.get(line.itemId);
    const invoiceQuantity = roundQuantity(
      (existing?.invoiceQuantity ?? 0) + Number(line.stockQuantity),
    );
    const stock = available.get(line.itemId);
    // a deactivated item is unavailable however much stock it still carries:
    // the manual picker cannot show it and the API rejects it outright
    const inactive = stock ? !stock.isActive : false;
    const availableQuantity = inactive
      ? 0
      : Math.max(0, roundQuantity(Number(stock?.quantity ?? 0)));
    const quantity = Math.min(invoiceQuantity, availableQuantity);
    merged.set(line.itemId, {
      itemId: line.itemId,
      code: line.itemCode,
      name: line.itemName,
      stockUnit: line.stockUnit,
      invoiceQuantity,
      availableQuantity,
      quantity: String(quantity),
      clamped: quantity < invoiceQuantity,
      inactive,
      selected: quantity > 0,
    });
  }
  return [...merged.values()];
}

export function selectedTransferLines(
  rows: InvoiceTransferRow[],
  startKey: number,
): TransferLineForm[] {
  return rows
    .filter((row) => row.selected)
    .map((row, index) => ({
      key: startKey + index,
      itemId: String(row.itemId),
      quantity: row.quantity,
    }));
}

/**
 * Folds applied invoice rows into whatever the form already holds, so a second
 * invoice adds to the first instead of replacing it. Blank lines are dropped and
 * a repeated item keeps its original key — the API rejects duplicate items.
 */
export function mergeTransferLines(
  existing: TransferLineForm[],
  applied: TransferLineForm[],
): TransferLineForm[] {
  const byItem = new Map(
    existing
      .filter((line) => line.itemId !== "")
      .map((line) => [line.itemId, line]),
  );
  for (const line of applied) {
    const previous = byItem.get(line.itemId);
    byItem.set(
      line.itemId,
      previous ? { ...previous, quantity: line.quantity } : line,
    );
  }
  return [...byItem.values()];
}

export function newTransferLine(key: number): TransferLineForm {
  return { key, itemId: "", quantity: "" };
}

export function transferRequestBody(input: {
  notes: string;
  lines: TransferLineForm[];
}): TransferRequestBody {
  return {
    notes: input.notes.trim() || null,
    lines: input.lines.map((line) => ({
      variantId: Number(line.itemId),
      quantity: Number(line.quantity),
    })),
  };
}

export function transferTotalQuantity(lines: TransferLineForm[]) {
  return lines.reduce((total, line) => total + (Number(line.quantity) || 0), 0);
}
