import type { PreparedRecipe, Recipe } from "@cashier/shared";
import type { RecipeBody } from "@/services/recipes-service";

export type RecipeIngredientForm = {
  key: number;
  itemId: string;
  quantity: string;
};

export type ProductRecipeSizeForm = {
  key: number;
  name: string;
  sellingPrice: string;
  ingredients: RecipeIngredientForm[];
};

export type ProductRecipeForm = {
  type: "product";
  name: string;
  categoryId: string;
  sizes: ProductRecipeSizeForm[];
};

export type PreparedRecipeForm = {
  type: "prepared";
  name: string;
  categoryId: string;
  outputItemId: string;
  baseYield: string;
  ingredients: RecipeIngredientForm[];
};

export type RecipeForm = ProductRecipeForm | PreparedRecipeForm;

export const newRecipeIngredient = (key: number): RecipeIngredientForm => ({
  key,
  itemId: "",
  quantity: "",
});

export const newProductSize = (key: number): ProductRecipeSizeForm => ({
  key,
  name: "",
  sellingPrice: "",
  ingredients: [newRecipeIngredient(key * 100 + 1)],
});

export function emptyProductRecipeForm(): ProductRecipeForm {
  return {
    type: "product",
    name: "",
    categoryId: "",
    sizes: [newProductSize(1)],
  };
}

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

export function recipeRequestBody(form: RecipeForm): RecipeBody {
  if (form.type === "product") {
    return {
      type: "product",
      name: form.name.trim(),
      categoryId: Number(form.categoryId),
      sizes: form.sizes.map((size) => ({
        name: size.name.trim(),
        sellingPrice: Number(size.sellingPrice),
        ingredients: size.ingredients.map((ingredient) => ({
          itemId: Number(ingredient.itemId),
          quantity: Number(ingredient.quantity),
        })),
      })),
    };
  }
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
  if (recipe.type === "product") {
    return {
      type: "product",
      name: recipe.name,
      categoryId: String(recipe.categoryId),
      sizes: recipe.sizes.map((size, sizeIndex) => ({
        key: size.id,
        name: size.name,
        sellingPrice: size.sellingPrice,
        ingredients: size.ingredients.map((ingredient, ingredientIndex) => ({
          key: ingredient.id || sizeIndex * 100 + ingredientIndex,
          itemId: String(ingredient.itemId),
          quantity: ingredient.requiredQuantity,
        })),
      })),
    };
  }
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
      (recipe) =>
        recipe.isActive &&
        (recipe.type === "product"
          ? recipe.sizes.some((size) => !size.hasSufficientStock)
          : !recipe.hasSufficientStock),
    ).length,
    prepared: recipes.filter((recipe) => recipe.type === "prepared").length,
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
