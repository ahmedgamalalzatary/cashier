import type { TransferRequestBody } from "@/services/transfers-service";

export type TransferLineForm = {
  key: number;
  itemId: string;
  quantity: string;
};

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
      itemId: Number(line.itemId),
      quantity: Number(line.quantity),
    })),
  };
}

export function transferTotalQuantity(lines: TransferLineForm[]) {
  return lines.reduce((total, line) => total + (Number(line.quantity) || 0), 0);
}
