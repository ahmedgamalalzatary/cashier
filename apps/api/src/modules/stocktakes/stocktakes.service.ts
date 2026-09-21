import { HttpError } from "../../middleware/error.js";
import type {
  ConfirmStocktakeInput,
  ManualAdjustmentInput,
  StartStocktakeInput,
  UpdateStocktakeCountsInput,
} from "./stocktakes.schemas.js";
import type { StocktakesRepositoryPort } from "./stocktakes.repository.js";

const number3 = (value: string) => Number(Number(value).toFixed(3));

export class StocktakesService {
  constructor(private repo: StocktakesRepositoryPort) {}

  async start(input: StartStocktakeInput, userId: number) {
    const id = await this.repo.transaction(async (repo) => {
      const rows = await repo.snapshotItems(input.warehouse, input.categoryId);
      if (!rows.length)
        throw new HttpError(409, "لا توجد أصناف ضمن نطاق الجرد");
      const id = await repo.createSession({ ...input, createdBy: userId });
      await repo.createLines(id, rows);
      return id;
    });
    return this.find(id);
  }
  list() {
    return this.repo.list();
  }
  async find(id: number) {
    const row = await this.repo.detail(id);
    if (!row) throw new HttpError(404, "جلسة الجرد غير موجودة");
    return row;
  }
  async updateCounts(id: number, input: UpdateStocktakeCountsInput) {
    await this.repo.transaction(async (repo) => {
      const session = await repo.findSessionForUpdate(id);
      if (!session) throw new HttpError(404, "جلسة الجرد غير موجودة");
      if (session.status !== "draft")
        throw new HttpError(409, "تم اعتماد جلسة الجرد ولا يمكن تعديلها");
      try {
        await repo.updateCounts(id, input.lines);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "STOCKTAKE_LINE_NOT_FOUND"
        )
          throw new HttpError(400, "أحد الأصناف لا ينتمي إلى جلسة الجرد");
        throw error;
      }
    });
    return this.find(id);
  }
  async confirm(id: number, input: ConfirmStocktakeInput, _userId?: number) {
    await this.repo.transaction(async (repo) => {
      const session = await repo.findSessionForUpdate(id);
      if (!session) throw new HttpError(404, "جلسة الجرد غير موجودة");
      if (session.status !== "draft")
        throw new HttpError(409, "تم اعتماد جلسة الجرد من قبل");
      const lines = await repo.listLinesForUpdate(id);
      if (!lines.length || lines.some((line) => line.countedQuantity === null))
        throw new HttpError(400, "يجب إدخال الكمية الفعلية لكل أصناف الجرد");
      for (const line of lines) {
        const current = await repo.currentQuantity(
          line.itemId,
          session.warehouse,
        );
        if (number3(current) !== number3(line.recordedQuantity))
          throw new HttpError(
            409,
            "تغير رصيد أحد الأصناف بعد بدء الجرد؛ ابدأ جلسة جديدة",
          );
      }
      for (const line of lines)
        await this.adjust(
          repo,
          id,
          session.warehouse,
          line.itemId,
          number3(line.recordedQuantity),
          number3(line.countedQuantity!),
          input.note,
        );
      await repo.markConfirmed(id, input.note);
    });
    return this.find(id);
  }
  async manual(input: ManualAdjustmentInput, userId: number) {
    const id = await this.repo.transaction(async (repo) => {
      const recorded = await repo.currentQuantity(
        input.itemId,
        input.warehouse,
      );
      const id = await repo.createManualSession({
        warehouse: input.warehouse,
        note: input.note,
        createdBy: userId,
      });
      await repo.createManualLine({
        stocktakeId: id,
        itemId: input.itemId,
        recordedQuantity: number3(recorded).toFixed(3),
        countedQuantity: input.countedQuantity.toFixed(3),
      });
      await this.adjust(
        repo,
        id,
        input.warehouse,
        input.itemId,
        number3(recorded),
        input.countedQuantity,
        input.note,
      );
      await repo.markConfirmed(id, input.note);
      return id;
    });
    return this.find(id);
  }
  private async adjust(
    repo: StocktakesRepositoryPort,
    id: number,
    warehouse: "main" | "cafe",
    itemId: number,
    recorded: number,
    counted: number,
    note: string,
  ) {
    const difference = Number((counted - recorded).toFixed(3));
    if (difference < 0)
      await repo.consume({
        itemId,
        warehouse,
        quantity: -difference,
        movementType: "stocktake_shortage",
        referenceType: "stocktake",
        referenceId: id,
        notes: note,
        allowNegative: true,
      });
    if (difference > 0)
      await repo.receive({
        itemId,
        warehouse,
        quantity: difference,
        unitCost: await repo.currentFifoCost(itemId, warehouse),
        movementType: "stocktake_surplus",
        referenceType: "stocktake",
        referenceId: id,
        notes: note,
      });
  }
}
