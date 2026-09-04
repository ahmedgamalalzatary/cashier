import type {
  ExternalCacheRefreshStatus,
  ExternalProductCatalog,
  ProductStockSetupBody,
} from "@cashier/shared";
import { api } from "../lib/api";

type ProductCatalogPage = ExternalProductCatalog & {
  pagination: {
    currentPage: number;
    totalPages: number;
  };
};

export async function listProducts(params?: {
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const query = new URLSearchParams();
  if (!params) query.set("all", "true");
  if (params?.search) query.set("search", params.search);
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  return api<ProductCatalogPage>(
    `/api/products${query.size ? `?${query}` : ""}`,
  );
}

export function refreshProducts() {
  return api<{ accepted: true }>("/api/products/refresh", {
    method: "POST",
  });
}

export function getProductRefreshStatus() {
  return api<ExternalCacheRefreshStatus>("/api/products/refresh-status", {
    cache: "no-store",
  });
}

export function configureProductStock(
  externalProductId: number,
  body: ProductStockSetupBody,
) {
  return api<{ ok: true }>(`/api/products/${externalProductId}/stock-setup`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
