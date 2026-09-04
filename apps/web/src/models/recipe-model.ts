import type { PreparedRecipe, Recipe } from "@cashier/shared";
import type { RecipeBody } from "@/services/recipes-service";

export type RecipeIngredientForm = {
  key: number;
  itemId: string;
  quantity: string;
};

export type PreparedRecipeForm = {
  type: "prepared";
  name: string;
  categoryId: string;
  outputItemId: string;
  baseYield: string;
  ingredients: RecipeIngredientForm[];
};

export type RecipeForm = PreparedRecipeForm;

export const newRecipeIngredient = (key: number): RecipeIngredientForm => ({
  key,
  itemId: "",
  quantity: "",
});

export function emptyPreparedRecipeForm(): PreparedRecipeForm {
  return {
    type: "prepared",
    name: "",
    categoryId: "",
    outputItemId: "",
    baseYield: "",
    ingredients: [newRecipeIngredient(1)],
  };
}

export function selectRecipeOutputItem(
  form: RecipeForm,
  outputItemId: string,
): RecipeForm {
  return {
    ...form,
    outputItemId,
    ingredients: form.ingredients.map((row) =>
      row.itemId === outputItemId ? { ...row, itemId: "", quantity: "" } : row,
    ),
  };
}

export function recipeRequestBody(form: RecipeForm): RecipeBody {
  return {
    type: "prepared",
    name: form.name.trim(),
    categoryId: Number(form.categoryId),
    outputItemId: Number(form.outputItemId),
    baseYield: Number(form.baseYield),
    ingredients: form.ingredients.map((ingredient) => ({
      itemId: Number(ingredient.itemId),
      quantity: Number(ingredient.quantity),
    })),
  };
}

export function recipeFormFromRecipe(recipe: Recipe): RecipeForm {
  return {
    type: "prepared",
    name: recipe.name,
    categoryId: String(recipe.categoryId),
    outputItemId: String(recipe.outputItemId),
    baseYield: recipe.baseYield,
    ingredients: recipe.ingredients.map((ingredient, index) => ({
      key: ingredient.id || index,
      itemId: String(ingredient.itemId),
      quantity: ingredient.requiredQuantity,
    })),
  };
}

export function recipeStats(recipes: Recipe[]) {
  return {
    active: recipes.filter((recipe) => recipe.isActive).length,
    unavailable: recipes.filter(
      (recipe) => recipe.isActive && !recipe.hasSufficientStock,
    ).length,
    prepared: recipes.length,
  };
}

const QUANTITY_SCALE = BigInt(1_000);

function quantityToScaled(value: string | number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return BigInt(0);
  const [whole = "0", fraction = ""] = numeric.toFixed(3).split(".");
  return BigInt(whole) * QUANTITY_SCALE + BigInt(fraction.padEnd(3, "0"));
}

function roundPositiveDivide(numerator: bigint, denominator: bigint) {
  return (numerator + denominator / BigInt(2)) / denominator;
}

export function scalePreparationIngredients(
  ingredients: PreparedRecipe["ingredients"],
  requestedQuantity: string | number,
  baseYield: string | number,
) {
  const produced = quantityToScaled(requestedQuantity);
  const base = quantityToScaled(baseYield);

  return ingredients.map((ingredient) => {
    const scaled =
      base > BigInt(0)
        ? roundPositiveDivide(
            quantityToScaled(ingredient.requiredQuantity) * produced,
            base,
          )
        : BigInt(0);
    return {
      ...ingredient,
      scaledQuantity: Number(scaled) / Number(QUANTITY_SCALE),
      hasSufficientStock:
        scaled <= quantityToScaled(ingredient.availableQuantity),
    };
  });
}
