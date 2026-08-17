import type {
  OrderDetail,
  OrderDiscountType,
  OrderSummary,
  ExternalOrderSummary,
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

export function listExternalOrders() {
  return api<ExternalOrderSummary[]>("/api/orders/external");
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
