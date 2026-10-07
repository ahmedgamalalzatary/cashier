import type { InventoryStockRow, PurchaseInvoiceLine } from "@cashier/shared";
import type {
  TransferDirectBody,
  TransferRequestBody,
} from "@/services/transfers-service";

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
  /** already sent to the cafe from this invoice */
  transferredQuantity: number;
  /** what the invoice still owes the cafe */
  remainingQuantity: number;
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
    // an invoice may bill the same item on two lines, so the quantity already
    // sent to the cafe is per line but belongs to the item as a whole
    const transferredQuantity = roundQuantity(
      (existing?.transferredQuantity ?? 0) +
        Number(line.transferredToCafeQuantity ?? 0),
    );
    const stock = available.get(line.itemId);
    // a deactivated item is unavailable however much stock it still carries:
    // the manual picker cannot show it and the API rejects it outright
    const inactive = stock ? !stock.isActive : false;
    const availableQuantity = inactive
      ? 0
      : Math.max(0, roundQuantity(Number(stock?.quantity ?? 0)));
    // the invoice only still owes what it bought minus what already left for
    // the cafe, and never more than the main warehouse can supply
    const owedQuantity = Math.max(
      0,
      roundQuantity(invoiceQuantity - transferredQuantity),
    );
    const quantity = Math.min(owedQuantity, availableQuantity);
    merged.set(line.itemId, {
      itemId: line.itemId,
      code: line.itemCode,
      name: line.itemName,
      stockUnit: line.stockUnit,
      invoiceQuantity,
      transferredQuantity,
      remainingQuantity: owedQuantity,
      availableQuantity,
      quantity: String(quantity),
      clamped: quantity < owedQuantity,
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

export function newTransferLine(key: number): TransferLineForm {
  return { key, itemId: "", quantity: "" };
}

export function transferRequestBody(input: {
  clientRequestId: string;
  notes: string;
  lines: TransferLineForm[];
}): TransferRequestBody {
  return {
    clientRequestId: input.clientRequestId,
    notes: input.notes.trim() || null,
    lines: input.lines.map((line) => ({
      itemId: Number(line.itemId),
      quantity: Number(line.quantity),
    })),
  };
}

export function transferDirectBody(input: {
  notes: string;
  purchaseInvoiceId?: number | null;
  lines: TransferLineForm[];
}): TransferDirectBody {
  return {
    notes: input.notes.trim() || null,
    // only an invoice-sourced transfer may claim quantities against an invoice
    ...(input.purchaseInvoiceId ? { purchaseInvoiceId: input.purchaseInvoiceId } : {}),
    lines: input.lines.map((line) => ({
      itemId: Number(line.itemId),
      quantity: Number(line.quantity),
    })),
  };
}

export function transferTotalQuantity(lines: TransferLineForm[]) {
  return lines.reduce((total, line) => total + (Number(line.quantity) || 0), 0);
}
