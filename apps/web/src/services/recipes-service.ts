import type {
  PreparationDetail,
  PreparationSummary,
  Recipe,
} from "@cashier/shared";
import { api } from "../lib/api";

export type RecipeIngredientBody = { itemId: number; quantity: number };
export type ProductRecipeBody = {
  type: "product";
  name: string;
  categoryId: number;
  sizes: Array<{
    name: string;
    sellingPrice: number;
    ingredients: RecipeIngredientBody[];
  }>;
};
export type PreparedRecipeBody = {
  type: "prepared";
  name: string;
  categoryId: number;
  outputItemId: number;
  baseYield: number;
  ingredients: RecipeIngredientBody[];
};
export type RecipeBody = ProductRecipeBody | PreparedRecipeBody;
export type PreparationBody = { quantity: number; notes: string | null };

export function listRecipes() {
  return api<Recipe[]>("/api/recipes");
}

export function getRecipe(id: number) {
  return api<Recipe>(`/api/recipes/${id}`);
}

export function createRecipe(body: RecipeBody) {
  return api<{ id: number }>("/api/recipes", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateRecipe(id: number, body: RecipeBody) {
  return api<{ ok: true }>(`/api/recipes/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function setRecipeActive(id: number, active: boolean) {
  return api<{ ok: true }>(
    active ? `/api/recipes/${id}/active` : `/api/recipes/${id}`,
    { method: active ? "PUT" : "DELETE" },
  );
}

export function createPreparation(id: number, body: PreparationBody) {
  return api<{ preparationId: number }>(`/api/recipes/${id}/prepare`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listPreparations() {
  return api<PreparationSummary[]>("/api/recipes/preparations");
}

export function getPreparation(id: number) {
  return api<PreparationDetail>(`/api/recipes/preparations/${id}`);
}
