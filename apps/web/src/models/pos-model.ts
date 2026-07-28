import type { OrderDiscountType, PosCatalogProduct } from "@cashier/shared";

export type PosCartLine = {
  key: string;
  variantId: number;
  productName: string;
  colorName: string;
  sizeName: string;
  quantity: number;
  unitPrice: string;
};
export type DiscountSelection = {
  type: OrderDiscountType | null;
  value: number;
};

export function addCatalogSelection(
  cart: PosCartLine[],
  product: PosCatalogProduct,
) {
  const key = `variant:${product.variantId}`;
  const existing = cart.find((line) => line.key === key);
  if (existing)
    return cart.map((line) =>
      line.key === key ? { ...line, quantity: line.quantity + 1 } : line,
    );
  return [
    ...cart,
    {
      key,
      variantId: product.variantId,
      productName: product.productName,
      colorName: product.colorName,
      sizeName: product.sizeName,
      quantity: 1,
      unitPrice: product.sellingPrice,
    },
  ];
}

export function setCartLineQuantity(
  cart: PosCartLine[],
  key: string,
  quantity: number,
) {
  if (!Number.isFinite(quantity) || quantity <= 0)
    return cart.filter((line) => line.key !== key);
  return cart.map((line) =>
    line.key === key
      ? { ...line, quantity: Math.min(999, Math.max(1, Math.round(quantity))) }
      : line,
  );
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
  return products.filter(
    (product) =>
      (filters.mainCategoryId === null ||
        product.mainCategoryId === filters.mainCategoryId) &&
      (filters.subCategoryId === null ||
        product.subCategoryId === filters.subCategoryId) &&
      (!query ||
        `${product.productName} ${product.colorName} ${product.sizeName} ${product.barcode ?? ""} ${product.code}`
          .toLocaleLowerCase("ar")
          .includes(query)),
  );
}

export function catalogCategories(products: PosCatalogProduct[]) {
  const main = new Map<number, string>();
  const sub = new Map<number, { id: number; name: string; mainId: number }>();
  for (const product of products) {
    main.set(product.mainCategoryId, product.mainCategoryName);
    if (product.subCategoryId !== null && product.subCategoryName)
      sub.set(product.subCategoryId, {
        id: product.subCategoryId,
        name: product.subCategoryName,
        mainId: product.mainCategoryId,
      });
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
  const subtotal = cart.reduce(
    (sum, line) => sum + Number(line.unitPrice) * line.quantity,
    0,
  );
  const discountAmount =
    discount.type === "percent"
      ? (subtotal * discount.value) / 100
      : discount.type === "fixed"
        ? discount.value
        : 0;
  const total = Math.max(0, subtotal - discountAmount);
  return {
    subtotal,
    discountAmount,
    total,
    change: Math.max(0, cashReceived - total),
    hasEnoughCash: cashReceived >= total,
    discountValid:
      discount.type === null ||
      (discount.value > 0 &&
        (discount.type === "percent"
          ? discount.value <= 100
          : discountAmount <= subtotal)),
  };
}

export function orderPayload(
  cart: PosCartLine[],
  discount: DiscountSelection,
  cashReceived: number,
) {
  return {
    lines: cart.map((line) => ({
      variantId: line.variantId,
      quantity: line.quantity,
    })),
    discount:
      discount.type === null
        ? null
        : { type: discount.type, value: discount.value },
    cashReceived,
  };
}
