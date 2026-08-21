import type {
  OrderDetail,
  OrderDiscountType,
  OrderSummary,
  ExternalOrderSummary,
  ExternalProductCatalog,
} from "@cashier/shared";
import { api } from "../lib/api";

export type CreateOrderBody = {
  clientRequestId: string;
  lines: Array<
    {
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

export function listCatalog() {
  return api<ExternalProductCatalog>("/api/products");
}

export function listOrders() {
  return api<OrderSummary[]>("/api/orders");
}

export function listExternalOrders() {
  return api<{ data: ExternalOrderSummary[]; pagination: { currentPage: number; pageSize: number; totalCount: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean } }>("/api/orders/external");
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
