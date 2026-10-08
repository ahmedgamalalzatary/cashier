import type {
  OrderDetail,
  OrderDiscountType,
  OrderSummary,
  ExternalOrdersPage,
  PosCatalog,
} from "@cashier/shared";
import { api } from "@cashier/web-core/lib/api";

export type CreateOrderBody = {
  clientRequestId: string;
  lines: Array<
    | { type: "item"; itemId: string; quantity: number }
    | {
        type: "external_product";
        externalProductId: number;
        externalSizeId: number | null;
        quantity: number;
        modifiers: Array<{
          externalModifierOptionId: number;
          quantity: number;
        }>;
      }
  >;
  discount: { type: OrderDiscountType; value: number } | null;
  cashReceived: number;
};

export async function listCatalog() {
  return api<PosCatalog>("/api/products?all=true&pos=true");
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

export function getOrder(id: string) {
  return api<OrderDetail>(`/api/orders/${id}`);
}

export function createOrder(body: CreateOrderBody) {
  return api<OrderDetail>("/api/orders", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
