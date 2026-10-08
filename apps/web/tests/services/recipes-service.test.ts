import { testId } from "@cashier/shared/test-support";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@cashier/web-core/lib/api";
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

vi.mock("@cashier/web-core/lib/api", () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);

describe("recipes service", () => {
  beforeEach(() => mockedApi.mockReset());

  it("uses the prepared-recipe CRUD endpoints and request bodies", async () => {
    mockedApi.mockResolvedValue(undefined as never);
    const body = {
      type: "prepared" as const,
      name: "شربات",
      categoryId: testId(2),
      outputItemId: testId(8),
      baseYield: 2,
      ingredients: [{ itemId: testId(4), quantity: 0.2 }],
    };

    await listRecipes();
    await getRecipe(testId(7));
    await createRecipe(body);
    await updateRecipe(testId(7), body);
    await setRecipeActive(testId(7), false);
    await setRecipeActive(testId(7), true);

    expect(mockedApi.mock.calls).toEqual([
      ["/api/recipes"],
      ["/api/recipes/00000000-0000-7000-8000-000000000007"],
      ["/api/recipes", { method: "POST", body: JSON.stringify(body) }],
      ["/api/recipes/00000000-0000-7000-8000-000000000007", { method: "PUT", body: JSON.stringify(body) }],
      ["/api/recipes/00000000-0000-7000-8000-000000000007", { method: "DELETE" }],
      ["/api/recipes/00000000-0000-7000-8000-000000000007/active", { method: "PUT" }],
    ]);
  });

  it("uses immutable preparation endpoints", async () => {
    mockedApi.mockResolvedValue(undefined as never);
    await createPreparation(testId(3), { quantity: 5, notes: "وردية صباحية" });
    await listPreparations();
    await getPreparation(testId(9));

    expect(mockedApi.mock.calls).toEqual([
      [
        "/api/recipes/00000000-0000-7000-8000-000000000003/prepare",
        {
          method: "POST",
          body: JSON.stringify({ quantity: 5, notes: "وردية صباحية" }),
        },
      ],
      ["/api/recipes/preparations"],
      ["/api/recipes/preparations/00000000-0000-7000-8000-000000000009"],
    ]);
  });
});
