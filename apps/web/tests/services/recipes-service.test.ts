import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/lib/api";
import {
  createPreparation,
  createRecipe,
  getPreparation,
  getRecipe,
  listPreparations,
  listRecipes,
  setRecipeActive,
  updateRecipe,
} from "../../src/services/recipes-service";

vi.mock("../../src/lib/api", () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);

describe("recipes service", () => {
  beforeEach(() => mockedApi.mockReset());

  it("uses the recipe CRUD endpoints and request bodies", async () => {
    mockedApi.mockResolvedValue(undefined as never);
    const body = {
      type: "product" as const,
      name: "لاتيه",
      categoryId: 2,
      sizes: [
        {
          name: "صغير",
          sellingPrice: 30,
          ingredients: [{ itemId: 4, quantity: 0.2 }],
        },
      ],
    };

    await listRecipes();
    await getRecipe(7);
    await createRecipe(body);
    await updateRecipe(7, body);
    await setRecipeActive(7, false);
    await setRecipeActive(7, true);

    expect(mockedApi.mock.calls).toEqual([
      ["/api/recipes"],
      ["/api/recipes/7"],
      ["/api/recipes", { method: "POST", body: JSON.stringify(body) }],
      ["/api/recipes/7", { method: "PUT", body: JSON.stringify(body) }],
      ["/api/recipes/7", { method: "DELETE" }],
      ["/api/recipes/7/active", { method: "PUT" }],
    ]);
  });

  it("uses immutable preparation endpoints", async () => {
    mockedApi.mockResolvedValue(undefined as never);
    await createPreparation(3, { quantity: 5, notes: "وردية صباحية" });
    await listPreparations();
    await getPreparation(9);

    expect(mockedApi.mock.calls).toEqual([
      [
        "/api/recipes/3/prepare",
        {
          method: "POST",
          body: JSON.stringify({ quantity: 5, notes: "وردية صباحية" }),
        },
      ],
      ["/api/recipes/preparations"],
      ["/api/recipes/preparations/9"],
    ]);
  });
});
