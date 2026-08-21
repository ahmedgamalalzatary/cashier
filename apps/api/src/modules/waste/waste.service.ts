import { createHash } from "node:crypto";
import type { AuthUser } from "@cashier/shared";
import { HttpError } from "../../middleware/error.js";
import type { WasteInput } from "./waste.schemas.js";
import type { WasteRepository } from "./waste.repository.js";

const scaled = (value: string, scale: number) => {
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0"))
  );
};
const format = (value: bigint, scale: number) =>
  `${value / 10n ** BigInt(scale)}.${(value % 10n ** BigInt(scale)).toString().padStart(scale, "0")}`;
const roundDivide = (value: bigint, divisor: bigint) =>
  (value + divisor / 2n) / divisor;
const fingerprint = (input: WasteInput) =>
  createHash("sha256").update(JSON.stringify(input)).digest("hex");
const isDuplicate = (error: unknown) =>
  !!error &&
  typeof error === "object" &&
  "code" in error &&
  (error as { code?: unknown }).code === "ER_DUP_ENTRY";

export class WasteService {
  constructor(private repo: WasteRepository) {}

  catalog() {
    return Promise.all([
      this.repo.listCatalogItems(),
      this.repo.listCatalogExternalProducts(),
    ]).then(([items, products]) => ({ items, products }));
  }

  async create(input: WasteInput, actor: AuthUser) {
    const requestFingerprint = fingerprint(input);
    let id: number;
    try {
      id = await this.repo.transaction(async (repo, inventory) => {
        const prior = await repo.findByClientRequestId(input.clientRequestId);
        if (prior) {
          if (
            prior.recordedBy !== actor.id ||
            prior.requestFingerprint !== requestFingerprint
          )
            throw new HttpError(409, "معرّف الطلب مستخدم لبيانات هالك مختلفة");
          return prior.id;
        }

        let shiftId: number | null = null;
        if (actor.role === "cashier") {
          if (input.warehouse !== "cafe")
            throw new HttpError(403, "الكاشير يسجل هالك مخزن الكافيه فقط");
          const shift = await repo.findOpenShiftForCashier(actor.id);
          if (!shift)
            throw new HttpError(409, "يجب فتح وردية قبل تسجيل الهالك");
          shiftId = shift.id;
        }

        const occurredAt = new Date();
        let itemId: number | null = null;
        let externalProductId: number | null = null;
        let externalSizeId: number | null = null;
        let targetName: string;
        let sizeName: string | null = null;
        let consumptions: Array<{
          itemId: number;
          itemName: string;
          quantity: string;
        }>;

        if (input.target.type === "item") {
          const item = await repo.findItem(input.target.itemId);
          if (!item) throw new HttpError(404, "الصنف غير موجود");
          if (!item.isActive) throw new HttpError(409, "الصنف موقوف");
          itemId = item.id;
          targetName = item.name;
          consumptions = [
            {
              itemId: item.id,
              itemName: item.name,
              quantity: input.quantity.toFixed(3),
            },
          ];
        } else {
          const target = input.target;
          if (input.warehouse !== "cafe")
            throw new HttpError(
              400,
              "هالك المنتج الخارجي يسجل في مخزن الكافيه فقط",
            );
          const product = await repo.loadExternalProduct(
            target.externalProductId,
          );
          if (!product || !product.isCurrent)
            throw new HttpError(404, "المنتج الخارجي غير موجود");
          const size =
            target.externalSizeId === null
              ? null
              : product.sizes.find(
                  (candidate) => candidate.externalId === target.externalSizeId,
                );
          if (
            (product.sizes.length > 0 && !size) ||
            (product.sizes.length === 0 && target.externalSizeId !== null)
          )
            throw new HttpError(400, "المقاس لا ينتمي إلى المنتج المحدد");
          const ingredients = size?.ingredients ?? product.ingredients;
          if (!ingredients.length)
            throw new HttpError(
              409,
              "المنتج الخارجي أو المقاس المحدد لا يحتوي على مكونات",
            );
          externalProductId = product.externalId;
          externalSizeId = size?.externalId ?? null;
          targetName = product.nameAr;
          sizeName = size?.nameAr ?? null;
          consumptions = ingredients.map((ingredient) => ({
            itemId: ingredient.itemId,
            itemName: ingredient.itemName,
            quantity: format(
              scaled(ingredient.quantity, 3) * BigInt(input.quantity),
              3,
            ),
          }));
        }

        const id = await repo.create({
          clientRequestId: input.clientRequestId,
          requestFingerprint,
          shiftId,
          warehouse: input.warehouse,
          targetType: input.target.type,
          itemId,
          recipeId: null,
          recipeSizeId: null,
          externalProductId,
          externalSizeId,
          targetName,
          sizeName,
          quantity: input.quantity.toFixed(3),
          reason: input.reason,
          reasonCode: input.reason,
          note: input.note,
          totalCost: "0.00",
          recordedBy: actor.id,
          occurredAt,
        });

        let costAtScaleNine = 0n;
        for (const consumption of consumptions) {
          if (consumption.quantity === "0.000")
            throw new HttpError(
              400,
              "كمية أحد مكونات الوصفة أصغر من دقة المخزون",
            );
          const result = await inventory.consume({
            itemId: consumption.itemId,
            warehouse: input.warehouse,
            quantity: Number(consumption.quantity),
            movementType: "waste",
            referenceType: "waste",
            referenceId: id,
            notes: input.note,
            occurredAt,
          });
          for (const allocation of result.allocations) {
            await repo.createAllocation({
              wasteEntryId: id,
              itemId: consumption.itemId,
              itemName: consumption.itemName,
              batchId: allocation.batchId,
              stockMovementId: allocation.movementId,
              quantity: allocation.quantity,
              unitCost: allocation.unitCost,
            });
            costAtScaleNine +=
              scaled(allocation.quantity, 3) * scaled(allocation.unitCost, 6);
          }
        }
        await repo.updateCost(
          id,
          format(roundDivide(costAtScaleNine, 10_000_000n), 2),
        );
        return id;
      });
    } catch (error) {
      if (!isDuplicate(error)) throw error;
      const prior = await this.repo.findByClientRequestId(
        input.clientRequestId,
      );
      if (
        !prior ||
        prior.recordedBy !== actor.id ||
        prior.requestFingerprint !== requestFingerprint
      )
        throw new HttpError(409, "معرّف الطلب مستخدم لبيانات هالك مختلفة");
      id = prior.id;
    }
    return this.get(id);
  }

  list(actor: AuthUser) {
    return this.repo.list(actor.role === "cashier" ? "cafe" : undefined);
  }

  async get(id: number, actor?: AuthUser) {
    const entry = await this.repo.find(id);
    if (!entry) throw new HttpError(404, "سجل الهالك غير موجود");
    if (actor?.role === "cashier" && entry.warehouse !== "cafe")
      throw new HttpError(403, "لا تملك صلاحية عرض هالك المخزن الرئيسي");
    return { ...entry, allocations: await this.repo.allocations(id) };
  }
}
