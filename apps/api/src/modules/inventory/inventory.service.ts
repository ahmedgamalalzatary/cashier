import { HttpError } from "../../middleware/error.js";
import type {
  InventoryRepositoryPort,
  StockMovementWrite,
  Warehouse,
} from "./inventory.repository.js";

type MovementContext = {
  itemId: number;
  warehouse: Warehouse;
  quantity: number;
  movementType: string;
  referenceType?: string | null;
  referenceId?: number | null;
  notes?: string | null;
  occurredAt?: Date;
};

export type ReceiveStockInput = MovementContext & {
  /** Exact non-negative DECIMAL(16,6), passed as text to avoid JS rounding. */
  unitCost: string;
};

export type ConsumeStockInput = MovementContext & {
  allowNegative?: boolean;
};

export type FifoAllocation = {
  batchId: number | null;
  quantity: string;
  unitCost: string;
};

export type DeficitAllocation = {
  deficitMovementId: number;
  batchId: number;
  quantity: string;
  unitCost: string;
};

const POWERS_OF_TEN = [1n, 10n, 100n, 1_000n, 10_000n, 100_000n, 1_000_000n];
const MAX_QUANTITY = 99_999_999_999.999;
const MAX_UNIT_COST_SCALED = 9_999_999_999_999_999n;

function decimalToScaled(value: string, scale: number) {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const result =
    BigInt(whole || "0") * POWERS_OF_TEN[scale] +
    BigInt(fraction.padEnd(scale, "0").slice(0, scale) || "0");
  return negative ? -result : result;
}

function formatScaled(value: bigint, scale: number) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const divisor = POWERS_OF_TEN[scale];
  const whole = absolute / divisor;
  const fraction = (absolute % divisor).toString().padStart(scale, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function normalizeQuantity(value: number) {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_QUANTITY) {
    throw new HttpError(400, "الكمية خارج النطاق المسموح");
  }
  const fixed = value.toFixed(3);
  if (Math.abs(value - Number(fixed)) > 1e-9) {
    throw new HttpError(400, "الكمية تحتوي على أكثر من ثلاث خانات عشرية");
  }
  return fixed;
}

function normalizeUnitCost(value: string) {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,6})?$/.test(value)) {
    throw new HttpError(
      400,
      "تكلفة الوحدة يجب أن تكون رقماً غير سالب بست خانات عشرية كحد أقصى",
    );
  }
  const scaled = decimalToScaled(value, 6);
  if (scaled > MAX_UNIT_COST_SCALED) {
    throw new HttpError(400, "تكلفة الوحدة خارج نطاق قاعدة البيانات");
  }
  return formatScaled(scaled, 6);
}

function costFromProduct(productAtScaleNine: bigint) {
  return formatScaled((productAtScaleNine + 500n) / 1_000n, 6);
}

/**
 * Repository-bound primitives that do not open their own transaction.
 * Purchase/transfer/recipe services can construct this with a repository
 * bound to their outer DB transaction and keep document + stock writes atomic.
 */
export class InventoryTransaction {
  constructor(private repo: InventoryRepositoryPort) {}

  private async activeItemOrFail(itemId: number) {
    const item = await this.repo.findItemForUpdate(itemId);
    if (!item) throw new HttpError(404, "الصنف غير موجود");
    if (!item.isActive) throw new HttpError(409, "الصنف موقوف");
  }

  async receive(input: ReceiveStockInput) {
    const quantity = normalizeQuantity(input.quantity);
    const unitCost = normalizeUnitCost(input.unitCost);
    const occurredAt = input.occurredAt ?? new Date();

    await this.activeItemOrFail(input.itemId);
    const deficits = await this.repo.outstandingDeficits(
      input.itemId,
      input.warehouse,
    );
    const incomingQuantity = decimalToScaled(quantity, 3);
    let unallocated = incomingQuantity;
    const pendingAllocations: Array<{
      deficitMovementId: number;
      quantity: string;
    }> = [];
    for (const deficit of deficits) {
      if (unallocated === 0n) break;
      const outstanding = decimalToScaled(deficit.remainingQuantity, 3);
      const allocated = outstanding < unallocated ? outstanding : unallocated;
      pendingAllocations.push({
        deficitMovementId: deficit.movementId,
        quantity: formatScaled(allocated, 3),
      });
      unallocated -= allocated;
    }

    const batchId = await this.repo.createBatch({
      itemId: input.itemId,
      warehouse: input.warehouse,
      initialQuantity: quantity,
      remainingQuantity: formatScaled(unallocated, 3),
      unitCost,
      receivedAt: occurredAt,
      sourceType: input.movementType,
      sourceId: input.referenceId ?? null,
    });
    await this.repo.createMovement({
      itemId: input.itemId,
      warehouse: input.warehouse,
      batchId,
      movementType: input.movementType,
      quantity,
      unitCost,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      notes: input.notes ?? null,
      occurredAt,
    });

    const deficitAllocations: DeficitAllocation[] = [];
    for (const pending of pendingAllocations) {
      const allocation = {
        ...pending,
        batchId,
        unitCost,
      };
      await this.repo.createDeficitAllocation(allocation);
      deficitAllocations.push(allocation);
    }
    return { batchId, deficitAllocations };
  }

  async consume(input: ConsumeStockInput) {
    const quantity = normalizeQuantity(input.quantity);
    const requested = decimalToScaled(quantity, 3);
    const occurredAt = input.occurredAt ?? new Date();

    await this.activeItemOrFail(input.itemId);
    const batches = await this.repo.lockAvailableBatches(
      input.itemId,
      input.warehouse,
    );
    let remaining = requested;
    let totalCostAtScaleNine = 0n;
    const allocations: FifoAllocation[] = [];

    for (const batch of batches) {
      if (remaining === 0n) break;
      const available = decimalToScaled(batch.remainingQuantity, 3);
      const consumed = available < remaining ? available : remaining;
      const consumedQuantity = formatScaled(consumed, 3);
      const newRemaining = available - consumed;
      const movement: StockMovementWrite = {
        itemId: input.itemId,
        warehouse: input.warehouse,
        batchId: batch.id,
        movementType: input.movementType,
        quantity: formatScaled(-consumed, 3),
        unitCost: batch.unitCost,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        notes: input.notes ?? null,
        occurredAt,
      };
      await this.repo.updateBatchRemaining(
        batch.id,
        formatScaled(newRemaining, 3),
      );
      await this.repo.createMovement(movement);
      allocations.push({
        batchId: batch.id,
        quantity: consumedQuantity,
        unitCost: batch.unitCost,
      });
      totalCostAtScaleNine += consumed * decimalToScaled(batch.unitCost, 6);
      remaining -= consumed;
    }

    if (remaining > 0n && !input.allowNegative) {
      throw new HttpError(409, "الرصيد المتاح لا يكفي");
    }
    if (remaining > 0n) {
      const shortfall = formatScaled(remaining, 3);
      await this.repo.createMovement({
        itemId: input.itemId,
        warehouse: input.warehouse,
        batchId: null,
        movementType: input.movementType,
        quantity: formatScaled(-remaining, 3),
        unitCost: "0.000000",
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        notes: input.notes ?? null,
        occurredAt,
      });
      allocations.push({
        batchId: null,
        quantity: shortfall,
        unitCost: "0.000000",
      });
    }

    return {
      quantity,
      totalCost: costFromProduct(totalCostAtScaleNine),
      allocations,
    };
  }
}

export class InventoryService {
  constructor(private repo: InventoryRepositoryPort) {}

  transaction<T>(fn: (inventory: InventoryTransaction) => Promise<T>) {
    return this.repo.transaction((repo) => fn(new InventoryTransaction(repo)));
  }

  receive(input: ReceiveStockInput) {
    return this.transaction((inventory) => inventory.receive(input));
  }

  consume(input: ConsumeStockInput) {
    return this.transaction((inventory) => inventory.consume(input));
  }

  async listStock(warehouse: Warehouse) {
    const rows = await this.repo.listStock(warehouse);
    return rows.map((row) => ({
      ...row,
      isLowStock:
        row.isActive &&
        Number(row.minimumLevel) > 0 &&
        Number(row.quantity) <= Number(row.minimumLevel),
      isNegativeStock: Number(row.quantity) < 0,
    }));
  }
}
