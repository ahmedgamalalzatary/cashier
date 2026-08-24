import type {
  WasteCatalog,
  WasteDetail,
  WasteReason,
  WasteSummary,
} from "@cashier/shared";
import { api } from "../lib/api";

export type CreateWasteBody = {
  clientRequestId: string;
  warehouse: "main" | "cafe";
  target:
    { type: "item"; itemId: number } | { type: "recipe"; recipeSizeId: number };
  quantity: number;
  reason: WasteReason;
  note: string | null;
};

export const getWasteCatalog = () => api<WasteCatalog>("/api/waste/catalog");
export const listWaste = () => api<WasteSummary[]>("/api/waste");
export const getWaste = (id: number) => api<WasteDetail>(`/api/waste/${id}`);
export const createWaste = (body: CreateWasteBody) =>
  api<WasteDetail>("/api/waste", {
    method: "POST",
    body: JSON.stringify(body),
  });
