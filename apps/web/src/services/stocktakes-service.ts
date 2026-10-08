import type {
  StocktakeDetail,
  StocktakeSummary,
  Warehouse,
} from "@cashier/shared";
import { api } from "@cashier/web-core/lib/api";

const json = (body: unknown, method: string) => ({
  method,
  body: JSON.stringify(body),
});
export const listStocktakes = () => api<StocktakeSummary[]>("/api/stocktakes");
export const getStocktake = (id: string) =>
  api<StocktakeDetail>(`/api/stocktakes/${id}`);
export const startStocktake = (body: {
  warehouse: Warehouse;
  categoryId: string | null;
  note: string | null;
}) => api<StocktakeDetail>("/api/stocktakes", json(body, "POST"));
export const updateStocktakeCounts = (
  id: string,
  lines: Array<{ itemId: string; countedQuantity: number }>,
) =>
  api<StocktakeDetail>(`/api/stocktakes/${id}/counts`, json({ lines }, "PUT"));
export const confirmStocktake = (id: string, note: string) =>
  api<StocktakeDetail>(`/api/stocktakes/${id}/confirm`, json({ note }, "POST"));
export const createManualAdjustment = (body: {
  warehouse: Warehouse;
  itemId: string;
  countedQuantity: number;
  note: string;
}) =>
  api<StocktakeDetail>(
    "/api/stocktakes/manual-adjustments",
    json(body, "POST"),
  );
