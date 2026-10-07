import { testId } from "@cashier/shared/test-support";
import { describe, expect, it } from "vitest";
import { StocktakesService } from "../../src/modules/stocktakes/stocktakes.service.js";
import type { StocktakesRepositoryPort } from "../../src/modules/stocktakes/stocktakes.repository.js";

class FakeRepository implements StocktakesRepositoryPort {
  session = {
    id: testId(1),
    warehouse: "main" as const,
    status: "draft" as const,
    createdBy: testId(9),
  };
  lines = [
    { id: testId(11), itemId: testId(1), recordedQuantity: "5.000", countedQuantity: "3.000" },
    { id: testId(12), itemId: testId(2), recordedQuantity: "2.000", countedQuantity: "4.000" },
  ];
  current = new Map([
    [testId(1), "5.000"],
    [testId(2), "2.000"],
  ]);
  costs = new Map([[testId(2), "7.500000"]]);
  movements: Array<Record<string, unknown>> = [];
  completed = false;

  transaction<T>(fn: (repo: StocktakesRepositoryPort) => Promise<T>) {
    return fn(this);
  }
  async createSession() {
    return testId(1);
  }
  async snapshotItems() {
    return [];
  }
  async createLines() {}
  async findSessionForUpdate() {
    return this.session;
  }
  async listLinesForUpdate() {
    return this.lines;
  }
  async updateCounts() {}
  async currentQuantity(itemId: string) {
    return this.current.get(itemId) ?? "0.000";
  }
  async currentFifoCost(itemId: string) {
    return this.costs.get(itemId) ?? "0.000000";
  }
  async markConfirmed() {
    this.completed = true;
  }
  async detail() {
    return {
      ...this.session,
      status: this.completed ? "confirmed" : "draft",
      lines: this.lines,
    };
  }
  async list() {
    return [];
  }
  async createManualSession() {
    return testId(2);
  }
  async createManualLine() {}
  async receive(input: Record<string, unknown>) {
    this.movements.push({ direction: "in", ...input });
  }
  async consume(input: Record<string, unknown>) {
    this.movements.push({ direction: "out", ...input });
  }
}

describe("stocktake confirmation", () => {
  it("uses FIFO shortage and current FIFO cost surplus in one document", async () => {
    const repo = new FakeRepository();
    const result = await new StocktakesService(repo).confirm(
      testId(1),
      { note: "Ø¬Ø±Ø¯ Ø§Ù„Ø´Ù‡Ø±" },
      testId(9),
    );

    expect(repo.movements).toEqual([
      expect.objectContaining({
        direction: "out",
        itemId: testId(1),
        quantity: 2,
        movementType: "stocktake_shortage",
        referenceId: testId(1),
      }),
      expect.objectContaining({
        direction: "in",
        itemId: testId(2),
        quantity: 2,
        unitCost: "7.500000",
        movementType: "stocktake_surplus",
        referenceId: testId(1),
      }),
    ]);
    expect(repo.completed).toBe(true);
    expect(result).toMatchObject({ id: testId(1), status: "confirmed" });
  });

  it("rejects stale snapshots without writing movements", async () => {
    const repo = new FakeRepository();
    repo.current.set(testId(1), "4.000");
    await expect(
      new StocktakesService(repo).confirm(testId(1), { note: "Ø¬Ø±Ø¯" }, testId(9)),
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.movements).toEqual([]);
    expect(repo.completed).toBe(false);
  });

  it("rejects a second confirmation", async () => {
    const repo = new FakeRepository();
    repo.session = { ...repo.session, status: "confirmed" };
    await expect(
      new StocktakesService(repo).confirm(testId(1), { note: "Ø¬Ø±Ø¯" }, testId(9)),
    ).rejects.toMatchObject({ status: 409 });
  });
});
