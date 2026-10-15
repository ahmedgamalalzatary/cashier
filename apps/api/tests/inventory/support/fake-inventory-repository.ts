import { testId } from "@cashier/shared/test-support";
import type {
  InventoryRepositoryPort,
  StockBatchRecord,
  StockMovementWrite,
} from "../../../src/modules/inventory/inventory.repository.js";

type ItemRecord = { id: string; isActive: boolean };

export class FakeInventoryRepository implements InventoryRepositoryPort {
  items = new Map<string, ItemRecord>([
    [testId(1), { id: testId(1), isActive: true }],
  ]);
  batches: StockBatchRecord[] = [];
  movements: StockMovementWrite[] = [];
  deficitAllocations: Array<{
    deficitMovementId: string;
    batchId: string;
    quantity: string;
    unitCost: string;
  }> = [];
  refreshedSaleCosts: string[][] = [];
  private nextBatchId = 1;

  async transaction<T>(fn: (repo: InventoryRepositoryPort) => Promise<T>) {
    const transaction = new FakeInventoryRepository();
    transaction.items = new Map(this.items);
    transaction.batches = structuredClone(this.batches);
    transaction.movements = structuredClone(this.movements);
    transaction.deficitAllocations = structuredClone(this.deficitAllocations);
    transaction.nextBatchId = this.nextBatchId;
    transaction.refreshedSaleCosts = structuredClone(this.refreshedSaleCosts);
    const result = await fn(transaction);
    this.items = transaction.items;
    this.batches = transaction.batches;
    this.movements = transaction.movements;
    this.deficitAllocations = transaction.deficitAllocations;
    this.nextBatchId = transaction.nextBatchId;
    this.refreshedSaleCosts = transaction.refreshedSaleCosts;
    return result;
  }

  async findItemForUpdate(id: string) {
    return this.items.get(id);
  }

  async createBatch(data: Omit<StockBatchRecord, "id">) {
    const id = testId(this.nextBatchId++);
    this.batches.push({ id, ...data });
    return id;
  }

  async createMovement(data: StockMovementWrite) {
    this.movements.push(data);
    return testId(this.movements.length);
  }

  async outstandingDeficits(itemId: string, warehouse: "main" | "cafe") {
    return this.movements.flatMap((movement, index) => {
      if (
        movement.itemId !== itemId ||
        movement.warehouse !== warehouse ||
        movement.batchId !== null ||
        Number(movement.quantity) >= 0
      )
        return [];
      const movementId = testId(index + 1);
      const allocated = this.deficitAllocations
        .filter((allocation) => allocation.deficitMovementId === movementId)
        .reduce((sum, allocation) => sum + Number(allocation.quantity), 0);
      const remaining = -Number(movement.quantity) - allocated;
      return remaining > 0
        ? [{ movementId, remainingQuantity: remaining.toFixed(3) }]
        : [];
    });
  }

  async createDeficitAllocation(data: {
    deficitMovementId: string;
    batchId: string;
    quantity: string;
    unitCost: string;
  }) {
    this.deficitAllocations.push(data);
  }

  async refreshSaleCosts(deficitMovementIds: string[]) {
    this.refreshedSaleCosts.push(deficitMovementIds);
  }

  async lockAvailableBatches(itemId: string, warehouse: "main" | "cafe") {
    return this.batches.filter(
      (batch) =>
        batch.itemId === itemId &&
        batch.warehouse === warehouse &&
        Number(batch.remainingQuantity) > 0,
    );
  }

  async updateBatchRemaining(id: string, remainingQuantity: string) {
    const batch = this.batches.find((candidate) => candidate.id === id);
    if (batch) batch.remainingQuantity = remainingQuantity;
  }

  async listStock() {
    return [];
  }

  async lastKnownUnitCosts(itemIds: string[]) {
    const result = new Map<string, string>();
    const ordered = [...this.batches].sort(
      (a, b) => b.receivedAt.getTime() - a.receivedAt.getTime(),
    );
    for (const itemId of itemIds) {
      const batch = ordered.find((candidate) => candidate.itemId === itemId);
      result.set(itemId, batch ? batch.unitCost : "0.000000");
    }
    return result;
  }
}
