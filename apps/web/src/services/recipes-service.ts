import type {
  PreparationDetail,
  PreparationSummary,
  Recipe,
} from "@cashier/shared";
import { api } from "@cashier/web-core/lib/api";

export type RecipeIngredientBody = { itemId: string; quantity: number };
export type RecipeBody = {
  type: "prepared";
  name: string;
  categoryId: string;
  outputItemId: string;
  baseYield: number;
  ingredients: RecipeIngredientBody[];
};
export type PreparationBody = { quantity: number; notes: string | null };

export function listRecipes() {
  return api<Recipe[]>("/api/recipes");
}

export function getRecipe(id: string) {
  return api<Recipe>(`/api/recipes/${id}`);
}

export function createRecipe(body: RecipeBody) {
  return api<{ id: string }>("/api/recipes", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateRecipe(id: string, body: RecipeBody) {
  return api<{ ok: true }>(`/api/recipes/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function setRecipeActive(id: string, active: boolean) {
  return api<{ ok: true }>(
    active ? `/api/recipes/${id}/active` : `/api/recipes/${id}`,
    { method: active ? "PUT" : "DELETE" },
  );
}

export function createPreparation(id: string, body: PreparationBody) {
  return api<{ preparationId: string }>(`/api/recipes/${id}/prepare`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listPreparations() {
  return api<PreparationSummary[]>("/api/recipes/preparations");
}

export function getPreparation(id: string) {
  return api<PreparationDetail>(`/api/recipes/preparations/${id}`);
}
