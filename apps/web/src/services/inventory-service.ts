import type { InventoryStockRow } from "@cashier/shared";
import { api } from "../lib/api";

export function getMainWarehouseStock() {
  return api<InventoryStockRow[]>("/api/inventory/main/stock");
}
