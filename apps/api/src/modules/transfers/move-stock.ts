import { HttpError } from "../../middleware/error.js";
import type { InventoryTransaction } from "../inventory/inventory.service.js";
import type { TransfersRepository } from "./transfers.repository.js";

// Moves stock main → cafe FIFO inside the caller's transaction, carrying each
// main batch's cost into a matching cafe batch.
export async function moveStockToCafe(
  repo: TransfersRepository,
  inventory: InventoryTransaction,
  header: {
    requestId: number | null;
    purchaseInvoiceId: number | null;
    createdBy: number;
    approvedBy: number;
    notes: string | null;
  },
  lines: Array<{ itemId: number; quantity: number }>,
) {
  const transferId = await repo.createTransfer(header);
  const occurredAt = new Date();
  const orderedLines = [...lines].sort((a, b) => a.itemId - b.itemId);
  for (const line of orderedLines) {
    const consumed = await inventory.consume({
      itemId: line.itemId,
      warehouse: "main",
      quantity: line.quantity,
      movementType: "transfer_out",
      referenceType: "transfer",
      referenceId: transferId,
      occurredAt,
    });
    for (const allocation of consumed.allocations) {
      if (allocation.batchId === null) {
        throw new HttpError(409, "الرصيد المتاح لا يكفي");
      }
      const received = await inventory.receive({
        itemId: line.itemId,
        warehouse: "cafe",
        quantity: Number(allocation.quantity),
        unitCost: allocation.unitCost,
        movementType: "transfer_in",
        referenceType: "transfer",
        referenceId: transferId,
        occurredAt,
      });
      await repo.createTransferLine({
        transferId,
        itemId: line.itemId,
        quantity: allocation.quantity,
        unitCost: allocation.unitCost,
        sourceBatchId: allocation.batchId,
        cafeBatchId: received.batchId,
      });
    }
  }
  return transferId;
}
