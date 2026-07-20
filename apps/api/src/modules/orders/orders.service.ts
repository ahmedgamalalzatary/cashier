import { createHash, randomUUID } from "node:crypto";
import { HttpError } from "../../middleware/error.js";
import type { FifoAllocation } from "../inventory/inventory.service.js";
import type { OrdersRepository } from "./orders.repository.js";
import type { OrderInput, OrderLineInput } from "./orders.schemas.js";

const formatScaled = (value: bigint, scale: number) => {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const divisor = 10n ** BigInt(scale);
  return `${negative ? "-" : ""}${absolute / divisor}.${(absolute % divisor)
    .toString()
    .padStart(scale, "0")}`;
};

const stringToScaled = (value: string, scale: number) => {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const result =
    BigInt(whole || "0") * 10n ** BigInt(scale) +
    BigInt(fraction.padEnd(scale, "0").slice(0, scale) || "0");
  return negative ? -result : result;
};

const numberToScaled = (value: number, scale: number) =>
  BigInt(value.toFixed(scale).replace(".", ""));

const roundDivide = (numerator: bigint, denominator: bigint) =>
  (numerator + denominator / 2n) / denominator;

const isDuplicateEntry = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "ER_DUP_ENTRY";

type NormalizedLine =
  | { type: "recipe"; recipeSizeId: number; quantity: number }
  | { type: "item"; itemId: number; quantity: number };

function normalizeLines(lines: OrderLineInput[]): NormalizedLine[] {
  const combined = new Map<string, NormalizedLine>();
  for (const line of lines) {
    const key =
      line.type === "recipe"
        ? `recipe:${line.recipeSizeId}`
        : `item:${line.itemId}`;
    const existing = combined.get(key);
    if (existing) existing.quantity += line.quantity;
    else combined.set(key, { ...line });
  }
  return [...combined.values()];
}

function orderNumber(now: Date) {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `POS-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function requestFingerprint(data: OrderInput) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        lines: data.lines,
        discount: data.discount,
        cashReceived: data.cashReceived,
      }),
    )
    .digest("hex");
}

export class OrdersService {
  constructor(private repo: OrdersRepository) {}

  async catalog() {
    const [recipeRows, itemRows] = await Promise.all([
      this.repo.listCatalogRecipes(),
      this.repo.listCatalogItems(),
    ]);
    const recipesById = new Map<
      number,
      {
        type: "recipe";
        recipeId: number;
        name: string;
        categoryId: number;
        mainCategoryId: number;
        mainCategoryName: string;
        subCategoryId: number | null;
        subCategoryName: string | null;
        sizes: Array<{ id: number; name: string; sellingPrice: string }>;
      }
    >();
    for (const row of recipeRows) {
      const parentId = row.parentCategoryId;
      let recipe = recipesById.get(row.recipeId);
      if (!recipe) {
        recipe = {
          type: "recipe",
          recipeId: row.recipeId,
          name: row.name,
          categoryId: row.categoryId,
          mainCategoryId: parentId ?? row.categoryId,
          mainCategoryName: row.parentCategoryName ?? row.categoryName,
          subCategoryId: parentId === null ? null : row.categoryId,
          subCategoryName: parentId === null ? null : row.categoryName,
          sizes: [],
        };
        recipesById.set(row.recipeId, recipe);
      }
      recipe.sizes.push({
        id: row.sizeId,
        name: row.sizeName,
        sellingPrice: row.sellingPrice!,
      });
    }
    const resale = itemRows.map((row) => ({
      type: "item" as const,
      itemId: row.itemId,
      name: row.name,
      categoryId: row.categoryId,
      mainCategoryId: row.parentCategoryId ?? row.categoryId,
      mainCategoryName: row.parentCategoryName ?? row.categoryName,
      subCategoryId: row.parentCategoryId === null ? null : row.categoryId,
      subCategoryName: row.parentCategoryId === null ? null : row.categoryName,
      sellingPrice: row.sellingPrice!,
      stockUnit: row.stockUnit,
    }));
    return [...recipesById.values(), ...resale].sort((a, b) =>
      a.name.localeCompare(b.name, "ar"),
    );
  }

  async create(data: OrderInput, cashierId: number) {
    let orderId: number;
    const fingerprint = requestFingerprint(data);
    try {
      orderId = await this.repo.transaction(async (repo, inventory) => {
        const existing = await repo.findByClientRequestId(data.clientRequestId);
        if (existing) {
          if (existing.requestFingerprint !== fingerprint) {
            throw new HttpError(409, "معرّف الطلب مستخدم لبيانات بيع مختلفة");
          }
          if (existing.cashierId !== cashierId) {
            throw new HttpError(409, "معرّف الطلب مستخدم من مستخدم آخر");
          }
          return existing.id;
        }

        const normalized = normalizeLines(data.lines);
        const recipeInputs = normalized.filter(
          (line): line is Extract<NormalizedLine, { type: "recipe" }> =>
            line.type === "recipe",
        );
        const itemInputs = normalized.filter(
          (line): line is Extract<NormalizedLine, { type: "item" }> =>
            line.type === "item",
        );
        if (recipeInputs.some((line) => line.quantity > 999)) {
          throw new HttpError(400, "كمية منتج الوصفة خارج النطاق المسموح");
        }

        const recipeRows = await repo.lockRecipeSizes(
          recipeInputs.map((line) => line.recipeSizeId),
        );
        const recipeBySize = new Map(
          recipeRows.map((row) => [row.sizeId, row]),
        );
        const itemRows = await repo.lockResaleItems(
          itemInputs.map((line) => line.itemId),
        );
        const itemById = new Map(itemRows.map((row) => [row.id, row]));
        const ingredientRows = await repo.listIngredientsForSizes(
          recipeInputs.map((line) => line.recipeSizeId),
        );
        const ingredientsBySize = new Map<number, typeof ingredientRows>();
        for (const ingredient of ingredientRows) {
          const group = ingredientsBySize.get(ingredient.recipeSizeId) ?? [];
          group.push(ingredient);
          ingredientsBySize.set(ingredient.recipeSizeId, group);
        }

        const stockItemIds = [
          ...itemInputs.map((line) => line.itemId),
          ...ingredientRows.map((row) => row.itemId),
        ];
        const stockRows = await repo.lockStockItems(stockItemIds);
        const stockById = new Map(stockRows.map((row) => [row.id, row]));
        if (stockById.size !== new Set(stockItemIds).size) {
          throw new HttpError(409, "أحد أصناف المخزون غير موجود");
        }
        if (stockRows.some((row) => !row.isActive)) {
          throw new HttpError(409, "أحد أصناف المخزون موقوف");
        }

        const calculated = normalized.map((line) => {
          if (line.type === "recipe") {
            const product = recipeBySize.get(line.recipeSizeId);
            if (!product) throw new HttpError(404, "حجم منتج الوصفة غير موجود");
            if (
              product.recipeType !== "product" ||
              !product.recipeIsActive ||
              product.sellingPrice === null
            ) {
              throw new HttpError(409, "منتج الوصفة غير متاح للبيع");
            }
            const ingredientList =
              ingredientsBySize.get(line.recipeSizeId) ?? [];
            if (ingredientList.length === 0) {
              throw new HttpError(409, "منتج الوصفة لا يحتوي على مكونات");
            }
            const quantity = numberToScaled(line.quantity, 3);
            const unitPrice = stringToScaled(product.sellingPrice, 2);
            return {
              ...line,
              recipeId: product.recipeId,
              productName: product.recipeName,
              sizeName: product.sizeName,
              quantityText: formatScaled(quantity, 3),
              unitPriceText: formatScaled(unitPrice, 2),
              lineSubtotal: roundDivide(quantity * unitPrice, 1_000n),
              ingredients: ingredientList,
            };
          }
          const item = itemById.get(line.itemId);
          if (!item) throw new HttpError(404, "صنف إعادة البيع غير موجود");
          if (
            item.type !== "resale" ||
            !item.isActive ||
            item.sellingPrice === null
          ) {
            throw new HttpError(409, "الصنف غير متاح للبيع المباشر");
          }
          const quantity = numberToScaled(line.quantity, 3);
          const unitPrice = stringToScaled(item.sellingPrice, 2);
          return {
            ...line,
            recipeId: null,
            productName: item.name,
            sizeName: null,
            quantityText: formatScaled(quantity, 3),
            unitPriceText: formatScaled(unitPrice, 2),
            lineSubtotal: roundDivide(quantity * unitPrice, 1_000n),
            ingredients: [],
          };
        });

        const subtotal = calculated.reduce(
          (sum, line) => sum + line.lineSubtotal,
          0n,
        );
        if (subtotal > 999_999_999_999n) {
          throw new HttpError(400, "إجمالي الطلب خارج النطاق المسموح");
        }
        let discountValue: bigint | null = null;
        let discountAmount = 0n;
        if (data.discount) {
          discountValue = numberToScaled(data.discount.value, 2);
          discountAmount =
            data.discount.type === "percent"
              ? roundDivide(subtotal * discountValue, 10_000n)
              : discountValue;
          if (discountAmount > subtotal) {
            throw new HttpError(400, "الخصم الثابت أكبر من إجمالي الطلب");
          }
        }
        const total = subtotal - discountAmount;
        const cashReceived = numberToScaled(data.cashReceived, 2);
        if (cashReceived < total) {
          throw new HttpError(400, "المبلغ المستلم أقل من إجمالي الطلب");
        }
        const changeAmount = cashReceived - total;
        const occurredAt = new Date();
        const generatedOrderNumber = orderNumber(occurredAt);
        const orderId = await repo.createOrder({
          orderNumber: generatedOrderNumber,
          clientRequestId: data.clientRequestId,
          requestFingerprint: fingerprint,
          cashierId,
          shiftId: null,
          subtotal: formatScaled(subtotal, 2),
          discountType: data.discount?.type ?? null,
          discountValue:
            discountValue === null ? null : formatScaled(discountValue, 2),
          discountAmount: formatScaled(discountAmount, 2),
          total: formatScaled(total, 2),
          cashReceived: formatScaled(cashReceived, 2),
          changeAmount: formatScaled(changeAmount, 2),
          totalCost: "0.00",
          isNegativeStock: false,
          createdAt: occurredAt,
        });

        let roundedOrderCost = 0n;
        let orderHasDeficit = false;
        for (const line of calculated) {
          const lineId = await repo.createLine({
            orderId,
            type: line.type,
            recipeId: line.recipeId,
            recipeSizeId: line.type === "recipe" ? line.recipeSizeId : null,
            itemId: line.type === "item" ? line.itemId : null,
            productName: line.productName,
            sizeName: line.sizeName,
            quantity: line.quantityText,
            unitPrice: line.unitPriceText,
            lineSubtotal: formatScaled(line.lineSubtotal, 2),
            totalCost: "0.00",
            hasStockDeficit: false,
          });

          const consumptions =
            line.type === "recipe"
              ? line.ingredients.map((ingredient) => ({
                  itemId: ingredient.itemId,
                  itemName: ingredient.itemName,
                  quantity: formatScaled(
                    roundDivide(
                      stringToScaled(ingredient.quantity, 3) *
                        stringToScaled(line.quantityText, 3),
                      1_000n,
                    ),
                    3,
                  ),
                }))
              : [
                  {
                    itemId: line.itemId,
                    itemName: line.productName,
                    quantity: line.quantityText,
                  },
                ];

          let lineCostAtScaleNine = 0n;
          let lineHasDeficit = false;
          for (const consumption of consumptions) {
            if (consumption.quantity === "0.000") {
              throw new HttpError(
                400,
                "كمية أحد مكونات الوصفة أصغر من دقة المخزون",
              );
            }
            const consumed = await inventory.consume({
              itemId: consumption.itemId,
              warehouse: "cafe",
              quantity: Number(consumption.quantity),
              movementType: "sale",
              referenceType: "order",
              referenceId: orderId,
              notes: null,
              occurredAt,
              allowNegative: true,
            });
            for (const allocation of consumed.allocations) {
              await this.saveAllocation(
                repo,
                lineId,
                consumption.itemId,
                consumption.itemName,
                allocation,
              );
              const allocationCost =
                stringToScaled(allocation.quantity, 3) *
                stringToScaled(allocation.unitCost, 6);
              lineCostAtScaleNine += allocationCost;
              if (allocation.batchId === null) lineHasDeficit = true;
            }
          }
          const roundedLineCost = roundDivide(lineCostAtScaleNine, 10_000_000n);
          await repo.updateLine(lineId, {
            totalCost: formatScaled(roundedLineCost, 2),
            hasStockDeficit: lineHasDeficit,
          });
          roundedOrderCost += roundedLineCost;
          orderHasDeficit ||= lineHasDeficit;
        }

        await repo.updateOrder(orderId, {
          totalCost: formatScaled(roundedOrderCost, 2),
          isNegativeStock: orderHasDeficit,
        });
        return orderId;
      });
    } catch (error) {
      if (!isDuplicateEntry(error)) throw error;
      const existing = await this.repo.findByClientRequestId(
        data.clientRequestId,
      );
      if (!existing) throw error;
      if (existing.requestFingerprint !== fingerprint) {
        throw new HttpError(409, "معرّف الطلب مستخدم لبيانات بيع مختلفة");
      }
      if (existing.cashierId !== cashierId) {
        throw new HttpError(409, "معرّف الطلب مستخدم من مستخدم آخر");
      }
      orderId = existing.id;
    }
    return this.get(orderId);
  }

  private saveAllocation(
    repo: OrdersRepository,
    orderLineId: number,
    itemId: number,
    itemName: string,
    allocation: FifoAllocation,
  ) {
    return repo.createAllocation({
      orderLineId,
      itemId,
      itemName,
      batchId: allocation.batchId,
      stockMovementId: allocation.movementId,
      quantity: allocation.quantity,
      unitCost: allocation.unitCost,
    });
  }

  list() {
    return this.repo.listRecent();
  }

  async get(id: number) {
    const order = await this.repo.findOrder(id);
    if (!order) throw new HttpError(404, "الطلب غير موجود");
    const lines = await this.repo.listLines(id);
    const allocations = await this.repo.listAllocations(
      lines.map((line) => line.id),
    );
    const allocationsByLine = new Map<number, typeof allocations>();
    for (const allocation of allocations) {
      const group = allocationsByLine.get(allocation.orderLineId) ?? [];
      group.push(allocation);
      allocationsByLine.set(allocation.orderLineId, group);
    }
    return {
      ...order,
      lines: lines.map((line) => ({
        ...line,
        allocations: (allocationsByLine.get(line.id) ?? []).map(
          ({ orderLineId: _orderLineId, ...allocation }) => allocation,
        ),
      })),
    };
  }
}
