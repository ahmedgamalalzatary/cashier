import { HttpError } from '../../middleware/error.js';
import type { RecipesRepository } from './recipes.repository.js';
import type {
  PreparationInput,
  RecipeInput,
} from './recipes.schemas.js';

const POWERS_OF_TEN = [
  1n,
  10n,
  100n,
  1_000n,
  10_000n,
  100_000n,
  1_000_000n,
  10_000_000n,
  100_000_000n,
  1_000_000_000n,
];

function decimalToScaled(value: string, scale: number) {
  const [whole = '0', fraction = ''] = value.split('.');
  return (
    BigInt(whole || '0') * POWERS_OF_TEN[scale] +
    BigInt(fraction.padEnd(scale, '0').slice(0, scale) || '0')
  );
}

function numberToScaled(value: number, scale: number) {
  return decimalToScaled(value.toFixed(scale), scale);
}

function formatScaled(value: bigint, scale: number) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const divisor = POWERS_OF_TEN[scale];
  const whole = absolute / divisor;
  const fraction = (absolute % divisor).toString().padStart(scale, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

function roundDivide(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n) return -roundDivide(-numerator, denominator);
  return (numerator + denominator / 2n) / denominator;
}

function allocationCostAtScaleNine(allocation: {
  quantity: string;
  unitCost: string;
}) {
  return (
    decimalToScaled(allocation.quantity, 3) *
    decimalToScaled(allocation.unitCost, 6)
  );
}

function costAtScaleNineToCents(value: bigint) {
  return roundDivide(value, 10_000_000n);
}

type StoredIngredient = Awaited<
  ReturnType<RecipesRepository['listIngredients']>
>[number];

export class RecipesService {
  constructor(private repo: RecipesRepository) {}

  create(data: RecipeInput) {
    return this.repo.transaction(async (repo) => {
      await this.validateDefinition(repo, data);
      const recipeId = await repo.createRecipe({
        name: data.name,
        type: data.type,
        categoryId: data.categoryId,
        outputItemId: data.type === 'prepared' ? data.outputItemId : null,
      });
      await this.writeChildren(repo, recipeId, data);
      return recipeId;
    });
  }

  update(id: number, data: RecipeInput) {
    return this.repo.transaction(async (repo) => {
      const existing = await repo.lockRecipe(id);
      if (!existing) throw new HttpError(404, 'الوصفة غير موجودة');
      await this.validateDefinition(repo, data, id);
      await repo.deleteRecipeChildren(id);
      await repo.updateRecipe(id, {
        name: data.name,
        type: data.type,
        categoryId: data.categoryId,
        outputItemId: data.type === 'prepared' ? data.outputItemId : null,
      });
      await this.writeChildren(repo, id, data);
    });
  }

  async list() {
    const headers = await this.repo.listRecipeHeaders();
    return Promise.all(headers.map((header) => this.decorate(header)));
  }

  async get(id: number) {
    const header = await this.repo.findRecipeHeader(id);
    if (!header) throw new HttpError(404, 'الوصفة غير موجودة');
    return this.decorate(header);
  }

  deactivate(id: number) {
    return this.repo.transaction(async (repo) => {
      const recipe = await repo.lockRecipe(id);
      if (!recipe) throw new HttpError(404, 'الوصفة غير موجودة');
      await repo.setActive(id, false);
    });
  }

  reactivate(id: number) {
    return this.repo.transaction(async (repo) => {
      const recipe = await repo.lockRecipe(id);
      if (!recipe) throw new HttpError(404, 'الوصفة غير موجودة');
      const data = await this.storedDefinition(repo, id, recipe);
      await this.validateDefinition(repo, data, id);
      await repo.setActive(id, true);
    });
  }

  prepare(id: number, data: PreparationInput, preparedBy: number) {
    return this.repo.transaction(async (repo, inventory) => {
      const recipe = await repo.lockRecipe(id);
      if (!recipe) throw new HttpError(404, 'الوصفة غير موجودة');
      if (!recipe.isActive) throw new HttpError(409, 'الوصفة موقوفة');
      if (recipe.type !== 'prepared' || recipe.outputItemId === null) {
        throw new HttpError(409, 'هذه الوصفة لا تنتج صنفاً مُحضّراً');
      }

      const header = await repo.findRecipeHeader(id);
      if (!header?.outputItemName) {
        throw new HttpError(409, 'صنف ناتج الوصفة غير صالح');
      }
      const sizes = await repo.listSizes(id);
      const ingredients = await repo.listIngredients(id);
      const base = sizes[0];
      if (!base?.outputQuantity || sizes.length !== 1) {
        throw new HttpError(409, 'كمية الناتج الأساسية للوصفة غير صالحة');
      }

      const involvedIds = [
        recipe.outputItemId,
        ...ingredients.map((ingredient) => ingredient.itemId),
      ];
      const lockedItems = await repo.lockItems(involvedIds);
      const lockedById = new Map(lockedItems.map((item) => [item.id, item]));
      for (const itemId of involvedIds) {
        const item = lockedById.get(itemId);
        if (!item) throw new HttpError(404, 'أحد أصناف الوصفة غير موجود');
        if (!item.isActive)
          throw new HttpError(409, `الصنف "${item.name}" موقوف`);
      }

      const produced = numberToScaled(data.quantity, 3);
      const baseYield = decimalToScaled(base.outputQuantity, 3);
      const scaledIngredients = ingredients
        .map((ingredient) => ({
          ...ingredient,
          scaledQuantity: roundDivide(
            decimalToScaled(ingredient.quantity, 3) * produced,
            baseYield,
          ),
        }))
        .sort((a, b) => a.itemId - b.itemId);
      if (scaledIngredients.some((ingredient) => ingredient.scaledQuantity < 1n)) {
        throw new HttpError(
          400,
          'الكمية الناتجة صغيرة جداً لحساب مكونات قابلة للتسجيل',
        );
      }

      const occurredAt = new Date();
      const preparationId = await repo.createPreparation({
        recipeId: id,
        recipeName: recipe.name,
        outputItemId: recipe.outputItemId,
        outputItemName: header.outputItemName,
        producedQuantity: formatScaled(produced, 3),
        preparedBy,
        notes: data.notes ?? null,
        occurredAt,
      });

      let exactTotalCost = 0n;
      for (const ingredient of scaledIngredients) {
        const consumed = await inventory.consume({
          itemId: ingredient.itemId,
          warehouse: 'cafe',
          quantity: Number(formatScaled(ingredient.scaledQuantity, 3)),
          movementType: 'preparation_out',
          referenceType: 'preparation',
          referenceId: preparationId,
          occurredAt,
        });
        for (const allocation of consumed.allocations) {
          if (allocation.batchId === null) {
            throw new HttpError(409, 'الرصيد المتاح لا يكفي');
          }
          const allocationCost = allocationCostAtScaleNine(allocation);
          exactTotalCost += allocationCost;
          await repo.createPreparationAllocation({
            preparationId,
            ingredientItemId: ingredient.itemId,
            ingredientItemName: ingredient.itemName,
            quantity: allocation.quantity,
            unitCost: allocation.unitCost,
            sourceBatchId: allocation.batchId,
          });
        }
      }

      const unitCost = roundDivide(exactTotalCost, produced);
      const unitCostText = formatScaled(unitCost, 6);
      const received = await inventory.receive({
        itemId: recipe.outputItemId,
        warehouse: 'cafe',
        quantity: data.quantity,
        unitCost: unitCostText,
        movementType: 'preparation_in',
        referenceType: 'preparation',
        referenceId: preparationId,
        occurredAt,
      });
      await repo.completePreparation(preparationId, {
        totalCost: formatScaled(costAtScaleNineToCents(exactTotalCost), 2),
        unitCost: unitCostText,
        outputBatchId: received.batchId,
      });
      return preparationId;
    });
  }

  listPreparations() {
    return this.repo.listPreparations();
  }

  async getPreparation(id: number) {
    const row = await this.repo.findPreparation(id);
    if (!row) throw new HttpError(404, 'عملية التحضير غير موجودة');
    return {
      ...row,
      allocations: await this.repo.listPreparationAllocations(id),
    };
  }

  private async decorate(
    header: Awaited<ReturnType<RecipesRepository['findRecipeHeader']>> & {},
  ) {
    const sizes = await this.repo.listSizes(header.id);
    const ingredients = await this.repo.listIngredients(header.id);
    if (header.type === 'product') {
      return {
        ...header,
        sizes: await Promise.all(
          sizes.map(async (size) => {
            const sizeIngredients = ingredients.filter(
              (ingredient) => ingredient.recipeSizeId === size.id,
            );
            const preview = await this.costIngredients(sizeIngredients);
            const sellingPrice = size.sellingPrice ?? '0.00';
            const sellingPriceCents = decimalToScaled(sellingPrice, 2);
            const currentCostCents = preview.costCents;
            const marginCents =
              currentCostCents === null
                ? null
                : sellingPriceCents - currentCostCents;
            return {
              id: size.id,
              name: size.name,
              sellingPrice,
              currentCost:
                currentCostCents === null
                  ? null
                  : formatScaled(currentCostCents, 2),
              marginAmount:
                marginCents === null ? null : formatScaled(marginCents, 2),
              marginPercentage:
                marginCents === null
                  ? null
                  : formatScaled(
                      roundDivide(marginCents * 10_000n, sellingPriceCents),
                      2,
                    ),
              costPercentage:
                currentCostCents === null
                  ? null
                  : formatScaled(
                      roundDivide(
                        currentCostCents * 10_000n,
                        sellingPriceCents,
                      ),
                      2,
                    ),
              hasSufficientStock: preview.hasSufficientStock,
              ingredients: preview.ingredients,
            };
          }),
        ),
      };
    }

    const base = sizes[0];
    const preview = await this.costIngredients(ingredients);
    const outputQuantity = base?.outputQuantity ?? '0.000';
    const outputScaled = decimalToScaled(outputQuantity, 3);
    const estimatedUnitCost =
      preview.exactCost === null || outputScaled === 0n
        ? null
        : formatScaled(roundDivide(preview.exactCost, outputScaled), 6);
    return {
      ...header,
      baseYield: outputQuantity,
      currentCost:
        preview.costCents === null
          ? null
          : formatScaled(preview.costCents, 2),
      estimatedUnitCost,
      hasSufficientStock: preview.hasSufficientStock,
      ingredients: preview.ingredients,
    };
  }

  private async costIngredients(ingredients: StoredIngredient[]) {
    let exactCost = 0n;
    let hasSufficientStock = true;
    const decorated = [];
    for (const ingredient of ingredients) {
      const batches = await this.repo.availableCafeBatches(ingredient.itemId);
      const required = decimalToScaled(ingredient.quantity, 3);
      const available = batches.reduce(
        (total, batch) =>
          total + decimalToScaled(batch.remainingQuantity, 3),
        0n,
      );
      let remaining = required;
      let ingredientExactCost = 0n;
      for (const batch of batches) {
        if (remaining === 0n) break;
        const batchQuantity = decimalToScaled(batch.remainingQuantity, 3);
        const used = batchQuantity < remaining ? batchQuantity : remaining;
        ingredientExactCost += used * decimalToScaled(batch.unitCost, 6);
        remaining -= used;
      }
      const sufficient = remaining === 0n;
      hasSufficientStock &&= sufficient;
      const ingredientCostCents = sufficient
        ? costAtScaleNineToCents(ingredientExactCost)
        : null;
      if (ingredientCostCents !== null) {
        exactCost += ingredientExactCost;
      }
      decorated.push({
        id: ingredient.id,
        itemId: ingredient.itemId,
        itemName: ingredient.itemName,
        itemType: ingredient.itemType,
        stockUnit: ingredient.stockUnit,
        requiredQuantity: ingredient.quantity,
        availableQuantity: formatScaled(available, 3),
        currentCost:
          ingredientCostCents === null
            ? null
            : formatScaled(ingredientCostCents, 2),
        hasSufficientStock: sufficient,
        itemIsActive: ingredient.itemIsActive,
      });
    }
    return {
      costCents: hasSufficientStock
        ? costAtScaleNineToCents(exactCost)
        : null,
      exactCost: hasSufficientStock ? exactCost : null,
      hasSufficientStock,
      ingredients: decorated,
    };
  }

  private async validateDefinition(
    repo: RecipesRepository,
    data: RecipeInput,
    recipeId?: number,
  ) {
    const category = await repo.findCategory(data.categoryId);
    if (!category) throw new HttpError(404, 'التصنيف غير موجود');
    if (!category.isActive) throw new HttpError(409, 'التصنيف موقوف');
    if (Number(category.childCount) > 0) {
      throw new HttpError(409, 'يجب اختيار تصنيف فرعي لا يحتوي على تصنيفات أخرى');
    }

    const ingredientRows =
      data.type === 'product'
        ? data.sizes.flatMap((size) => size.ingredients)
        : data.ingredients;
    const involvedIds = ingredientRows.map((row) => row.itemId);
    if (data.type === 'prepared') involvedIds.push(data.outputItemId);
    const lockedItems = await repo.lockItems(involvedIds);
    const itemsById = new Map(lockedItems.map((item) => [item.id, item]));
    for (const id of involvedIds) {
      const item = itemsById.get(id);
      if (!item) throw new HttpError(404, 'أحد أصناف الوصفة غير موجود');
      if (!item.isActive)
        throw new HttpError(409, `الصنف "${item.name}" موقوف`);
    }

    if (data.type === 'prepared') {
      const output = itemsById.get(data.outputItemId)!;
      if (output.type !== 'prepared') {
        throw new HttpError(409, 'ناتج الوصفة يجب أن يكون صنفاً مُحضّراً');
      }
      const owner = await repo.findRecipeByOutputItem(
        data.outputItemId,
        recipeId,
      );
      if (owner) throw new HttpError(409, 'الصنف المُحضّر مرتبط بوصفة أخرى');
      await this.assertNoPreparedCycle(repo, data, recipeId);
    }
  }

  private async assertNoPreparedCycle(
    repo: RecipesRepository,
    data: Extract<RecipeInput, { type: 'prepared' }>,
    recipeId?: number,
  ) {
    const edges = await repo.listPreparedEdges();
    const graph = new Map<number, number[]>();
    for (const edge of edges) {
      if (
        edge.recipeId === recipeId ||
        edge.outputItemId === null
      )
        continue;
      const targets = graph.get(edge.outputItemId) ?? [];
      targets.push(edge.ingredientItemId);
      graph.set(edge.outputItemId, targets);
    }
    graph.set(
      data.outputItemId,
      data.ingredients.map((ingredient) => ingredient.itemId),
    );

    const visited = new Set<number>();
    const stack = [data.outputItemId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const target of graph.get(current) ?? []) {
        if (target === data.outputItemId) {
          throw new HttpError(409, 'الوصفة المُحضّرة تُنشئ اعتماداً دائرياً');
        }
        stack.push(target);
      }
    }
  }

  private async writeChildren(
    repo: RecipesRepository,
    recipeId: number,
    data: RecipeInput,
  ) {
    if (data.type === 'product') {
      for (const [index, size] of data.sizes.entries()) {
        const sizeId = await repo.createSize({
          recipeId,
          name: size.name,
          sellingPrice: formatScaled(numberToScaled(size.sellingPrice, 2), 2),
          outputQuantity: null,
          sortOrder: index,
        });
        for (const ingredient of size.ingredients) {
          await repo.createIngredient({
            recipeSizeId: sizeId,
            itemId: ingredient.itemId,
            quantity: formatScaled(numberToScaled(ingredient.quantity, 3), 3),
          });
        }
      }
      return;
    }

    const sizeId = await repo.createSize({
      recipeId,
      name: 'الوصفة الأساسية',
      sellingPrice: null,
      outputQuantity: formatScaled(numberToScaled(data.baseYield, 3), 3),
      sortOrder: 0,
    });
    for (const ingredient of data.ingredients) {
      await repo.createIngredient({
        recipeSizeId: sizeId,
        itemId: ingredient.itemId,
        quantity: formatScaled(numberToScaled(ingredient.quantity, 3), 3),
      });
    }
  }

  private async storedDefinition(
    repo: RecipesRepository,
    recipeId: number,
    recipe: Awaited<ReturnType<RecipesRepository['lockRecipe']>> & {},
  ): Promise<RecipeInput> {
    const sizes = await repo.listSizes(recipeId);
    const ingredients = await repo.listIngredients(recipeId);
    if (recipe.type === 'product') {
      return {
        type: 'product',
        name: recipe.name,
        categoryId: recipe.categoryId,
        sizes: sizes.map((size) => ({
          name: size.name,
          sellingPrice: Number(size.sellingPrice),
          ingredients: ingredients
            .filter((ingredient) => ingredient.recipeSizeId === size.id)
            .map((ingredient) => ({
              itemId: ingredient.itemId,
              quantity: Number(ingredient.quantity),
            })),
        })),
      };
    }
    if (recipe.outputItemId === null || !sizes[0]?.outputQuantity) {
      throw new HttpError(409, 'بيانات الوصفة المُحضّرة غير مكتملة');
    }
    return {
      type: 'prepared',
      name: recipe.name,
      categoryId: recipe.categoryId,
      outputItemId: recipe.outputItemId,
      baseYield: Number(sizes[0].outputQuantity),
      ingredients: ingredients.map((ingredient) => ({
        itemId: ingredient.itemId,
        quantity: Number(ingredient.quantity),
      })),
    };
  }
}
