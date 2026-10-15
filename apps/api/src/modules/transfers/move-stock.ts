import type { InventoryTransaction } from "../inventory/inventory.service.js";
import type { TransfersRepository } from "./transfers.repository.js";

// Moves stock main → cafe FIFO inside the caller's transaction, carrying each
// main batch's cost into a matching cafe batch. When main stock is short the
// remainder is taken below zero and costed at the item's last known cost.
export async function moveStockToCafe(
  repo: TransfersRepository,
  inventory: InventoryTransaction,
  header: {
    requestId: string | null;
    purchaseInvoiceId: string | null;
    createdBy: string;
    approvedBy: string;
    notes: string | null;
  },
  lines: Array<{ itemId: string; quantity: number }>,
) {
  const transferId = await repo.createTransfer(header);
  const occurredAt = new Date();
  const orderedLines = [...lines].sort((a, b) => (a.itemId).localeCompare(b.itemId));
  const lastCosts = await inventory.lastKnownUnitCosts(
    [...new Set(orderedLines.map((line) => line.itemId))],
  );
  for (const line of orderedLines) {
    const consumed = await inventory.consume({
      itemId: line.itemId,
      warehouse: "main",
      quantity: line.quantity,
      movementType: "transfer_out",
      referenceType: "transfer",
      referenceId: transferId,
      occurredAt,
      allowNegative: true,
      shortfallUnitCost: lastCosts.get(line.itemId) ?? "0.000000",
    });
    for (const allocation of consumed.allocations) {
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
