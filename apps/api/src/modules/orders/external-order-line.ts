import { isExternalDiscountActive } from "@cashier/shared";
import { HttpError } from "../../middleware/error.js";

type Ingredient = { itemId: number; itemName: string; quantity: string };
type ExternalOrderProduct = {
  externalId: number;
  nameAr: string;
  price: string;
  discountPercentage: string | null;
  discountStart: string | null;
  discountEnd: string | null;
  isAvailable: boolean;
  isVisible: boolean;
  isCurrent: boolean;
  ingredients: Ingredient[];
  sizes: Array<{
    externalId: number;
    externalProductId: number;
    nameAr: string;
    price: string;
    ingredients: Ingredient[];
  }>;
  modifierGroups: Array<{
    externalId: number;
    nameAr: string | null;
    isRequired: boolean;
    maxSelections: number;
    options: Array<{
      externalId: number;
      nameAr: string | null;
      extraPrice: string;
      stockEffect: "incomplete" | "mapped" | "none";
      ingredients: Ingredient[];
    }>;
  }>;
};

type ExternalOrderSelection = {
  externalProductId: number;
  externalSizeId: number | null;
  quantity: number;
  modifiers: Array<{
    externalModifierOptionId: number;
    quantity: number;
  }>;
};

const scaled = (value: string, scale: number) => {
  const [whole = "0", fraction = ""] = value.split(".");
  return (
    BigInt(whole) * 10n ** BigInt(scale) +
    BigInt(fraction.padEnd(scale, "0").slice(0, scale) || "0")
  );
};

const format = (value: bigint, scale: number) => {
  const divisor = 10n ** BigInt(scale);
  return `${value / divisor}.${(value % divisor).toString().padStart(scale, "0")}`;
};

const roundDivide = (numerator: bigint, denominator: bigint) =>
  (numerator + denominator / 2n) / denominator;

export function calculateExternalOrderLine(
  product: ExternalOrderProduct,
  selection: ExternalOrderSelection,
  nowMs: number,
) {
  if (
    product.externalId !== selection.externalProductId ||
    !product.isCurrent ||
    !product.isAvailable ||
    !product.isVisible
  ) {
    throw new HttpError(409, "المنتج الخارجي غير متاح للبيع");
  }

  const size =
    selection.externalSizeId === null
      ? null
      : product.sizes.find(
          (candidate) =>
            candidate.externalId === selection.externalSizeId &&
            candidate.externalProductId === product.externalId,
        );
  if (
    (product.sizes.length > 0 && !size) ||
    (product.sizes.length === 0 && selection.externalSizeId !== null)
  ) {
    throw new HttpError(400, "المقاس لا ينتمي إلى المنتج المحدد");
  }

  const baseIngredients = size?.ingredients ?? product.ingredients;
  if (baseIngredients.length === 0) {
    throw new HttpError(409, "إعداد مخزون المنتج أو المقاس غير مكتمل");
  }
  if (
    product.modifierGroups.some((group) =>
      group.options.some(
        (option) =>
          option.stockEffect === "incomplete" ||
          (option.stockEffect === "mapped" && option.ingredients.length === 0),
      ),
    )
  ) {
    throw new HttpError(409, "إعداد مخزون إضافات المنتج غير مكتمل");
  }

  // The external catalog lost some modifier names, and an unnamed choice is
  // meaningless on a receipt, so the product is not sellable until upstream
  // repairs it.
  if (
    product.modifierGroups.some(
      (group) =>
        group.nameAr === null ||
        group.options.some((option) => option.nameAr === null),
    )
  ) {
    throw new HttpError(
      409,
      "إضافات المنتج بدون أسماء في الكتالوج الخارجي",
    );
  }

  const selectedByOption = new Map(
    selection.modifiers.map((modifier) => [
      modifier.externalModifierOptionId,
      modifier,
    ]),
  );
  const optionToGroup = new Map<
    number,
    {
      group: ExternalOrderProduct["modifierGroups"][number];
      option: ExternalOrderProduct["modifierGroups"][number]["options"][number];
    }
  >();
  for (const group of product.modifierGroups) {
    const selectedCount = group.options.reduce(
      (sum, option) =>
        sum + (selectedByOption.get(option.externalId)?.quantity ?? 0),
      0,
    );
    if (group.isRequired && selectedCount === 0) {
      throw new HttpError(400, `مجموعة الإضافات «${group.nameAr}» مطلوبة`);
    }
    if (selectedCount > group.maxSelections) {
      throw new HttpError(
        400,
        `تم تجاوز الحد الأقصى لمجموعة «${group.nameAr}»`,
      );
    }
    for (const option of group.options) {
      optionToGroup.set(option.externalId, { group, option });
    }
  }
  for (const modifier of selection.modifiers) {
    if (!optionToGroup.has(modifier.externalModifierOptionId)) {
      throw new HttpError(400, "إحدى الإضافات لا تنتمي إلى المنتج المحدد");
    }
  }

  let basePrice = scaled(size?.price ?? product.price, 2);
  const discountActive = isExternalDiscountActive(
    product.discountPercentage,
    product.discountStart,
    product.discountEnd,
    nowMs,
  );
  if (discountActive) {
    basePrice -= roundDivide(
      basePrice * scaled(product.discountPercentage!, 2),
      10_000n,
    );
  }

  const modifiers = selection.modifiers.map((modifier) => {
    const selected = optionToGroup.get(modifier.externalModifierOptionId)!;
    return {
      externalModifierGroupId: selected.group.externalId,
      externalModifierOptionId: selected.option.externalId,
      // Non-null: the guard above rejects the sale when any modifier name is
      // missing, so a receipt can never snapshot a nameless modifier.
      groupName: selected.group.nameAr!,
      optionName: selected.option.nameAr!,
      quantity: modifier.quantity,
      unitExtraPrice: selected.option.extraPrice,
      stockEffect: selected.option.stockEffect,
      ingredients: selected.option.ingredients,
    };
  });
  const modifierPrice = modifiers.reduce(
    (sum, modifier) =>
      sum + scaled(modifier.unitExtraPrice, 2) * BigInt(modifier.quantity),
    0n,
  );
  const unitPrice = basePrice + modifierPrice;
  const lineSubtotal = unitPrice * BigInt(selection.quantity);

  const consumptionByItem = new Map<
    number,
    { itemId: number; itemName: string; quantity: bigint }
  >();
  const addConsumption = (ingredient: Ingredient, multiplier: number) => {
    const existing = consumptionByItem.get(ingredient.itemId) ?? {
      itemId: ingredient.itemId,
      itemName: ingredient.itemName,
      quantity: 0n,
    };
    existing.quantity += scaled(ingredient.quantity, 3) * BigInt(multiplier);
    consumptionByItem.set(ingredient.itemId, existing);
  };
  for (const ingredient of baseIngredients) {
    addConsumption(ingredient, selection.quantity);
  }
  for (const modifier of modifiers) {
    if (modifier.stockEffect !== "mapped") continue;
    for (const ingredient of modifier.ingredients) {
      addConsumption(
        ingredient,
        modifier.quantity * selection.quantity,
      );
    }
  }

  return {
    externalProductId: product.externalId,
    externalSizeId: size?.externalId ?? null,
    productName: product.nameAr,
    sizeName: size?.nameAr ?? null,
    quantity: selection.quantity,
    quantityText: selection.quantity.toFixed(3),
    unitPrice: format(unitPrice, 2),
    lineSubtotal: format(lineSubtotal, 2),
    modifiers: modifiers.map(
      ({ stockEffect: _stockEffect, ingredients: _ingredients, ...modifier }) =>
        modifier,
    ),
    consumptions: [...consumptionByItem.values()]
      .sort((left, right) => left.itemId - right.itemId)
      .map((consumption) => ({
        itemId: consumption.itemId,
        itemName: consumption.itemName,
        quantity: format(consumption.quantity, 3),
      })),
  };
}
