import { isExternalDiscountActive } from "@cashier/shared";
import type { ExternalProduct, OrderDiscountType } from "@cashier/shared";

export type PosModifierSelection = {
  externalModifierOptionId: number;
  quantity: number;
  name: string;
};

export type PosCartLine = {
  key: string;
  type: "external_product";
  externalProductId: number;
  externalSizeId: number | null;
  productName: string;
  sizeName: string | null;
  quantity: number;
  unitPrice: string;
  modifiers: PosModifierSelection[];
};

export type DiscountSelection = {
  type: OrderDiscountType | null;
  value: number;
};

const MAX_MONEY = 9_999_999_999.99;

const stringToScaled = (value: string, scale: number) => {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const result =
    BigInt(whole || "0") * BigInt(10) ** BigInt(scale) +
    BigInt(fraction.padEnd(scale, "0").slice(0, scale) || "0");
  return negative ? -result : result;
};

const numberToScaled = (value: number, scale: number, maximum: number) => {
  if (!Number.isFinite(value) || value < 0 || value > maximum) return null;
  const fixed = value.toFixed(scale);
  if (Math.abs(Number(fixed) - value) > 1e-9) return null;
  return BigInt(fixed.replace(".", ""));
};

const formatScaled = (value: bigint, scale: number) => {
  const divisor = BigInt(10) ** BigInt(scale);
  return `${value / divisor}.${(value % divisor).toString().padStart(scale, "0")}`;
};

const roundDivide = (numerator: bigint, denominator: bigint) =>
  (numerator + denominator / BigInt(2)) / denominator;

export function addCatalogSelection(
  cart: PosCartLine[],
  product: ExternalProduct,
  externalSizeId: number | null,
  selectedModifiers: Array<{
    externalModifierOptionId: number;
    quantity: number;
  }>,
  nowMs: number,
) {
  if (!product.sellable) return cart;
  const normalizedById = new Map<number, number>();
  for (const modifier of selectedModifiers) {
    if (!Number.isInteger(modifier.quantity) || modifier.quantity <= 0) {
      return cart;
    }
    normalizedById.set(
      modifier.externalModifierOptionId,
      (normalizedById.get(modifier.externalModifierOptionId) ?? 0) +
        modifier.quantity,
    );
  }
  const normalizedModifiers = [...normalizedById].map(
    ([externalModifierOptionId, quantity]) => ({
      externalModifierOptionId,
      quantity,
    }),
  );
  const size =
    externalSizeId === null
      ? null
      : product.sizes.find(
          (candidate) => candidate.externalId === externalSizeId,
        );
  if (
    (product.sizes.length > 0 && !size) ||
    (product.sizes.length === 0 && externalSizeId !== null)
  )
    return cart;

  const selectedById = new Map(
    normalizedModifiers.map((modifier) => [
      modifier.externalModifierOptionId,
      modifier,
    ]),
  );
  for (const group of product.modifierGroups) {
    const count = group.options.reduce(
      (sum, option) =>
        sum + (selectedById.get(option.externalId)?.quantity ?? 0),
      0,
    );
    if ((group.isRequired && count === 0) || count > group.maxSelections) {
      return cart;
    }
  }
  const options = new Map(
    product.modifierGroups.flatMap((group) =>
      group.options.map((option) => [option.externalId, option] as const),
    ),
  );
  if (
    normalizedModifiers.some(
      (modifier) => !options.has(modifier.externalModifierOptionId),
    )
  ) {
    return cart;
  }

  let price = stringToScaled(size?.price ?? product.price, 2);
  if (
    isExternalDiscountActive(
      product.discountPercentage,
      product.discountStart,
      product.discountEnd,
      nowMs,
    )
  ) {
    price -= roundDivide(
      price * stringToScaled(product.discountPercentage!, 2),
      BigInt(10_000),
    );
  }
  const modifiers = normalizedModifiers
    .map((selection) => {
      const option = options.get(selection.externalModifierOptionId)!;
      price +=
        stringToScaled(option.extraPrice, 2) * BigInt(selection.quantity);
      return {
        ...selection,
        // Unreachable for a sellable product: one with unnamed modifiers is
        // never sellable, and the guard above returns the cart unchanged.
        name: option.nameAr ?? "إضافة بدون اسم",
      };
    })
    .sort(
      (left, right) =>
        left.externalModifierOptionId - right.externalModifierOptionId,
    );
  const key = JSON.stringify({
    product: product.externalId,
    size: size?.externalId ?? null,
    modifiers: modifiers.map((modifier) => ({
      externalModifierOptionId: modifier.externalModifierOptionId,
      quantity: modifier.quantity,
    })),
  });
  const existing = cart.find((line) => line.key === key);
  if (existing) {
    return cart.map((line) =>
      line.key === key ? { ...line, quantity: line.quantity + 1 } : line,
    );
  }
  return [
    ...cart,
    {
      key,
      type: "external_product" as const,
      externalProductId: product.externalId,
      externalSizeId: size?.externalId ?? null,
      productName: product.nameAr,
      sizeName: size?.nameAr ?? null,
      quantity: 1,
      unitPrice: formatScaled(price, 2),
      modifiers,
    },
  ];
}

export function setCartLineQuantity(
  cart: PosCartLine[],
  key: string,
  quantity: number,
) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return cart.filter((line) => line.key !== key);
  }
  return cart.map((line) =>
    line.key === key
      ? { ...line, quantity: Math.min(999, Math.max(1, Math.round(quantity))) }
      : line,
  );
}

export function filterCatalog(
  products: ExternalProduct[],
  filters: { categoryId: number | null; query: string },
) {
  const query = filters.query.trim().toLocaleLowerCase();
  return products.filter(
    (product) =>
      product.sellable &&
      (filters.categoryId === null ||
        product.externalCategoryId === filters.categoryId) &&
      (!query ||
        product.nameAr.toLocaleLowerCase("ar").includes(query) ||
        product.nameEn.toLocaleLowerCase("en").includes(query)),
  );
}

export function cartTotals(
  cart: PosCartLine[],
  discount: DiscountSelection,
  cashReceived: number,
) {
  let inputsValid = true;
  let subtotalCents = BigInt(0);
  for (const line of cart) {
    const quantity = numberToScaled(line.quantity, 3, 999);
    if (quantity === null) {
      inputsValid = false;
      continue;
    }
    subtotalCents += roundDivide(
      stringToScaled(line.unitPrice, 2) * quantity,
      BigInt(1_000),
    );
  }
  const discountValueCents = numberToScaled(
    discount.value || 0,
    2,
    discount.type === "percent" ? 100 : MAX_MONEY,
  );
  const receivedCents = numberToScaled(cashReceived || 0, 2, MAX_MONEY);
  inputsValid &&= discountValueCents !== null && receivedCents !== null;
  const safeDiscountValue = discountValueCents ?? BigInt(0);
  const safeReceived = receivedCents ?? BigInt(0);
  const discountAmountCents =
    discount.type === "percent"
      ? roundDivide(subtotalCents * safeDiscountValue, BigInt(10_000))
      : discount.type === "fixed"
        ? safeDiscountValue
        : BigInt(0);
  const discountValid =
    inputsValid &&
    (discount.type === null ||
      (discount.value > 0 &&
        (discount.type === "percent"
          ? discount.value <= 100
          : discountAmountCents <= subtotalCents)));
  const totalCents =
    subtotalCents > discountAmountCents
      ? subtotalCents - discountAmountCents
      : BigInt(0);
  return {
    subtotal: Number(subtotalCents) / 100,
    discountAmount: Number(discountAmountCents) / 100,
    total: Number(totalCents) / 100,
    change:
      Number(
        safeReceived > totalCents ? safeReceived - totalCents : BigInt(0),
      ) / 100,
    hasEnoughCash: inputsValid && safeReceived >= totalCents,
    discountValid,
  };
}

export function orderPayload(
  cart: PosCartLine[],
  discount: DiscountSelection,
  cashReceived: number,
) {
  return {
    lines: cart.map((line) => ({
      type: "external_product" as const,
      externalProductId: line.externalProductId,
      externalSizeId: line.externalSizeId,
      quantity: line.quantity,
      modifiers: line.modifiers.map((modifier) => ({
        externalModifierOptionId: modifier.externalModifierOptionId,
        quantity: modifier.quantity,
      })),
    })),
    discount:
      discount.type === null
        ? null
        : { type: discount.type, value: discount.value },
    cashReceived,
  };
}

export function defaultExternalSize(product: ExternalProduct) {
  const defaults = product.sizes.filter((size) => size.isDefault);
  return defaults.length === 1 ? defaults[0]!.externalId : null;
}

/**
 * Price shown on a POS catalog tile: the default size when the product defines
 * one, otherwise the cheapest size, with any active discount applied so the
 * tile matches what the cart and the server will charge.
 */
export function catalogTilePrice(product: ExternalProduct, nowMs: number) {
  const defaultSizeId = defaultExternalSize(product);
  const base =
    product.sizes.find((size) => size.externalId === defaultSizeId)?.price ??
    product.sizes
      .map((size) => size.price)
      .sort((a, b) => Number(a) - Number(b))[0] ??
    product.price;
  let price = stringToScaled(base, 2);
  if (
    isExternalDiscountActive(
      product.discountPercentage,
      product.discountStart,
      product.discountEnd,
      nowMs,
    )
  ) {
    price -= roundDivide(
      price * stringToScaled(product.discountPercentage!, 2),
      BigInt(10_000),
    );
  }
  return formatScaled(price, 2);
}
