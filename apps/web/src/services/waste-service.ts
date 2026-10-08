import type {
  WasteCatalog,
  WasteDetail,
  WasteReason,
  WasteSummary,
} from "@cashier/shared";
import { api } from "@cashier/web-core/lib/api";

export type CreateWasteBody = {
  clientRequestId: string;
  warehouse: "main" | "cafe";
  target:
    | { type: "item"; itemId: string }
    | {
        type: "external_product";
        externalProductId: number;
        externalSizeId: number | null;
      }
    | { type: "recipe"; recipeId: string; recipeSizeId: string };
  quantity: number;
  reason: WasteReason;
  note: string | null;
};

export const getWasteCatalog = () => api<WasteCatalog>("/api/waste/catalog");
export const listWaste = () => api<WasteSummary[]>("/api/waste");
export const getWaste = (id: string) => api<WasteDetail>(`/api/waste/${id}`);
export const createWaste = (body: CreateWasteBody) =>
  api<WasteDetail>("/api/waste", {
    method: "POST",
    body: JSON.stringify(body),
  });
