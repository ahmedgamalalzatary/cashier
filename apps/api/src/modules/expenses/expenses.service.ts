import { createHash } from "node:crypto";
import type { AuthUser } from "@cashier/shared";
import { HttpError } from "../../middleware/error.js";
import type { CreateExpenseInput } from "./expenses.schemas.js";
import type { ExpensesRepository } from "./expenses.repository.js";

const duplicate = (error: unknown) =>
  !!error &&
  typeof error === "object" &&
  "code" in error &&
  (error as { code?: unknown }).code === "ER_DUP_ENTRY";
const cairoDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export class ExpensesService {
  constructor(private repo: ExpensesRepository) {}

  categories(actor: AuthUser) {
    return this.repo.categories(actor.role === "admin");
  }

  createCategory(name: string) {
    return this.repo.createCategory(name).catch((error) => {
      if (duplicate(error))
        throw new HttpError(409, "تصنيف المصروف موجود بالفعل");
      throw error;
    });
  }

  async updateCategory(
    id: number,
    input: { name?: string; isActive?: boolean },
  ) {
    if (!(await this.repo.category(id)))
      throw new HttpError(404, "تصنيف المصروف غير موجود");
    try {
      return await this.repo.updateCategory(id, input);
    } catch (error) {
      if (duplicate(error))
        throw new HttpError(409, "تصنيف المصروف موجود بالفعل");
      throw error;
    }
  }

  async create(input: CreateExpenseInput, actor: AuthUser) {
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    let id: number;
    try {
      id = await this.repo.transaction(async (repo) => {
        const prior = await repo.byRequestId(input.clientRequestId);
        if (prior) {
          if (
            prior.recordedBy !== actor.id ||
            prior.requestFingerprint !== fingerprint
          )
            throw new HttpError(409, "معرّف الطلب مستخدم لمصروف مختلف");
          return prior.id;
        }
        const category = await repo.category(input.categoryId, true);
        if (!category) throw new HttpError(404, "تصنيف المصروف غير موجود");
        if (!category.isActive)
          throw new HttpError(409, "تصنيف المصروف موقوف");

        const shift =
          actor.role === "cashier"
            ? await repo.openShiftForCashier(actor.id)
            : undefined;
        if (actor.role === "cashier" && !shift)
          throw new HttpError(409, "يجب فتح وردية قبل تسجيل المصروف");

        id = await repo.create({
          clientRequestId: input.clientRequestId,
          requestFingerprint: fingerprint,
          type: actor.role === "cashier" ? "shift" : "general",
          categoryId: input.categoryId,
          shiftId: shift?.id ?? null,
          amount: input.amount.toFixed(2),
          expenseDate:
            actor.role === "cashier"
              ? cairoDate()
              : input.expenseDate!,
          note: input.note,
          recordedBy: actor.id,
        });
        return id;
      });
    } catch (error) {
      if (!duplicate(error)) throw error;
      const prior = await this.repo.byRequestId(input.clientRequestId);
      if (
        !prior ||
        prior.recordedBy !== actor.id ||
        prior.requestFingerprint !== fingerprint
      )
        throw new HttpError(409, "معرّف الطلب مستخدم لمصروف مختلف");
      id = prior.id;
    }
    return this.repo.get(id);
  }

  list(actor: AuthUser) {
    return this.repo.list(actor.role === "cashier" ? actor.id : undefined);
  }
}
