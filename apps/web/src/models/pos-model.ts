import type {
  OrderDiscountType,
  PosCatalogProduct,
  PosRecipeCatalogProduct,
} from "@cashier/shared";

export type PosCartLine = {
  key: string;
  type: "recipe" | "item";
  recipeSizeId?: number;
  itemId?: number;
  productName: string;
  sizeName: string | null;
  stockUnit: string | null;
  quantity: number;
  unitPrice: string;
};

export type DiscountSelection = {
  type: OrderDiscountType | null;
  value: number;
};

const MAX_MONEY = 9_999_999_999.99;
const MAX_STOCK_QUANTITY = 99_999_999_999.999;

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

const roundDivide = (numerator: bigint, denominator: bigint) =>
  (numerator + denominator / BigInt(2)) / denominator;

export function addCatalogSelection(
  cart: PosCartLine[],
  product: PosCatalogProduct,
  recipeSizeId?: number,
) {
  let incoming: PosCartLine;
  if (product.type === "recipe") {
    const size = product.sizes.find((row) => row.id === recipeSizeId);
    if (!size) return cart;
    incoming = {
      key: `recipe:${size.id}`,
      type: "recipe",
      recipeSizeId: size.id,
      productName: product.name,
      sizeName: size.name,
      stockUnit: null,
      quantity: 1,
      unitPrice: size.sellingPrice,
    };
  } else {
    incoming = {
      key: `item:${product.itemId}`,
      type: "item",
      itemId: product.itemId,
      productName: product.name,
      sizeName: null,
      stockUnit: product.stockUnit,
      quantity: 1,
      unitPrice: product.sellingPrice,
    };
  }
  const existing = cart.find((line) => line.key === incoming.key);
  if (!existing) return [...cart, incoming];
  return cart.map((line) =>
    line.key === incoming.key ? { ...line, quantity: line.quantity + 1 } : line,
  );
}

export function setCartLineQuantity(
  cart: PosCartLine[],
  key: string,
  quantity: number,
) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return cart.filter((line) => line.key !== key);
  }
  return cart.map((line) => {
    if (line.key !== key) return line;
    const normalized =
      line.type === "recipe"
        ? Math.min(999, Math.max(1, Math.round(quantity)))
        : Math.round(quantity * 1_000) / 1_000;
    return { ...line, quantity: normalized };
  });
}

export function filterCatalog(
  products: PosCatalogProduct[],
  filters: {
    mainCategoryId: number | null;
    subCategoryId: number | null;
    query: string;
  },
) {
  const query = filters.query.trim().toLocaleLowerCase("ar");
  return products.filter((product) => {
    if (
      filters.mainCategoryId !== null &&
      product.mainCategoryId !== filters.mainCategoryId
    )
      return false;
    if (
      filters.subCategoryId !== null &&
      product.subCategoryId !== filters.subCategoryId
    )
      return false;
    return !query || product.name.toLocaleLowerCase("ar").includes(query);
  });
}

export function catalogCategories(products: PosCatalogProduct[]) {
  const main = new Map<number, string>();
  const sub = new Map<number, { id: number; name: string; mainId: number }>();
  for (const product of products) {
    main.set(product.mainCategoryId, product.mainCategoryName);
    if (product.subCategoryId !== null && product.subCategoryName) {
      sub.set(product.subCategoryId, {
        id: product.subCategoryId,
        name: product.subCategoryName,
        mainId: product.mainCategoryId,
      });
    }
  }
  return {
    main: [...main].map(([id, name]) => ({ id, name })),
    sub: [...sub.values()],
  };
}

export function cartTotals(
  cart: PosCartLine[],
  discount: DiscountSelection,
  cashReceived: number,
) {
  let inputsValid = true;
  let subtotalCents = BigInt(0);
  for (const line of cart) {
    const quantity = numberToScaled(
      line.quantity,
      3,
      line.type === "recipe" ? 999 : MAX_STOCK_QUANTITY,
    );
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
    lines: cart.map((line) =>
      line.type === "recipe"
        ? {
            type: "recipe" as const,
            recipeSizeId: line.recipeSizeId!,
            quantity: line.quantity,
          }
        : {
            type: "item" as const,
            itemId: line.itemId!,
            quantity: line.quantity,
          },
    ),
    discount:
      discount.type === null
        ? null
        : { type: discount.type, value: discount.value },
    cashReceived,
  };
}

export function firstRecipeSize(product: PosRecipeCatalogProduct) {
  return product.sizes[0]?.id;
}
