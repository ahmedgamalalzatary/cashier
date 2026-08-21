import type {
  ExternalProductCatalog,
  ProductStockSetupBody,
} from "@cashier/shared";
import { api } from "../lib/api";

export function listProducts() {
  return api<ExternalProductCatalog>("/api/products");
}

export function refreshProducts() {
  return api<ExternalProductCatalog>("/api/products/refresh", {
    method: "POST",
  });
}

export function configureProductStock(
  externalProductId: number,
  body: ProductStockSetupBody,
) {
  return api<{ ok: true }>(
    `/api/products/${externalProductId}/stock-setup`,
    { method: "PUT", body: JSON.stringify(body) },
  );
}
