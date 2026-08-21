import type {
  OrderDetail,
  OrderDiscountType,
  OrderSummary,
  ExternalOrdersPage,
  ExternalProductCatalog,
} from "@cashier/shared";
import { api } from "../lib/api";

export type CreateOrderBody = {
  clientRequestId: string;
  lines: Array<{
    type: "external_product";
    externalProductId: number;
    externalSizeId: number | null;
    quantity: number;
    modifiers: Array<{
      externalModifierOptionId: number;
      quantity: number;
    }>;
  }>;
  discount: { type: OrderDiscountType; value: number } | null;
  cashReceived: number;
};

export async function listCatalog() {
  const first = await api<
    ExternalProductCatalog & {
      pagination: { currentPage: number; totalPages: number };
    }
  >("/api/products?page=1&pageSize=50");
  if (first.pagination.totalPages <= 1) return first;
  const rest = await Promise.all(
    Array.from({ length: first.pagination.totalPages - 1 }, (_, index) =>
      api<ExternalProductCatalog>(
        `/api/products?page=${index + 2}&pageSize=50`,
      ),
    ),
  );
  return { ...first, products: [first, ...rest].flatMap((page) => page.products) };
}

export function listOrders() {
  return api<OrderSummary[]>("/api/orders");
}

export function listExternalOrders(
  params: {
    search?: string;
    day?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.day) query.set("day", params.day);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  return api<ExternalOrdersPage>(
    `/api/orders/external${query.size ? `?${query}` : ""}`,
  );
}

export function getOrder(id: number) {
  return api<OrderDetail>(`/api/orders/${id}`);
}

export function createOrder(body: CreateOrderBody) {
  return api<OrderDetail>("/api/orders", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
