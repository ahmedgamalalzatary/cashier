import type {
  OrderDetail,
  OrderDiscountType,
  OrderSummary,
  ExternalOrdersPage,
  PosCatalogProduct,
} from "@cashier/shared";
import { api } from "../lib/api";

export type CreateOrderBody = {
  clientRequestId: string;
  lines: Array<
    | { type: "recipe"; recipeSizeId: number; quantity: number }
    | { type: "item"; itemId: number; quantity: number }
  >;
  discount: { type: OrderDiscountType; value: number } | null;
  cashReceived: number;
};

export function listCatalog() {
  return api<PosCatalogProduct[]>("/api/orders/catalog");
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
