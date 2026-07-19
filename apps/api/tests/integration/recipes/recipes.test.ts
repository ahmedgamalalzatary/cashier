import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import { createApp } from '../../../src/app.js';
import {
  categories,
  items,
  stockBatches,
  stockMovements,
} from '../../../src/db/schema.js';
import { appOptions, db } from '../../support/setup.js';
import { loginAs } from '../../support/helpers.js';

const app = () => createApp(db, appOptions);
let adminAuthorization: { readonly Authorization: string };
let cashierAuthorization: { readonly Authorization: string };

beforeEach(async () => {
  adminAuthorization = await loginAs(app(), 'admin');
  cashierAuthorization = await loginAs(app(), 'cashier');
});

async function createLeafCategory(name = 'مشروبات ساخنة') {
  const [category] = await db.insert(categories).values({ name });
  return category.insertId;
}

async function createItem(
  categoryId: number,
  name: string,
  type: 'raw' | 'resale' | 'prepared' = 'raw',
  stockUnit = 'جم',
) {
  const [item] = await db.insert(items).values({
    name,
    categoryId,
    type,
    stockUnit,
  });
  return item.insertId;
}

async function receiveCafeBatch(
  itemId: number,
  quantity: string,
  unitCost: string,
  receivedAt: Date,
) {
  const [batch] = await db.insert(stockBatches).values({
    itemId,
    warehouse: 'cafe',
    initialQuantity: quantity,
    remainingQuantity: quantity,
    unitCost,
    receivedAt,
    sourceType: 'transfer_in',
  });
  await db.insert(stockMovements).values({
    itemId,
    warehouse: 'cafe',
    batchId: batch.insertId,
    movementType: 'transfer_in',
    quantity,
    unitCost,
    occurredAt: receivedAt,
  });
  return batch.insertId;
}

async function createPreparedRecipe(input: {
  categoryId: number;
  outputItemId: number;
  ingredientItemId: number;
  ingredientQuantity?: number;
  baseYield?: number;
  name?: string;
}) {
  return request(app())
    .post('/api/recipes')
    .set(adminAuthorization)
    .send({
      type: 'prepared',
      name: input.name ?? 'شربات سكر',
      categoryId: input.categoryId,
      outputItemId: input.outputItemId,
      baseYield: input.baseYield ?? 2,
      ingredients: [
        {
          itemId: input.ingredientItemId,
          quantity: input.ingredientQuantity ?? 0.5,
        },
      ],
    });
}

describe('recipes and preparations', () => {
  it('creates a product recipe and calculates its exact live cafe FIFO cost and margin', async () => {
    const categoryId = await createLeafCategory();
    const coffeeId = await createItem(categoryId, 'بن');
    await receiveCafeBatch(
      coffeeId,
      '1.000',
      '10.000000',
      new Date('2026-07-18T00:00:00.000Z'),
    );
    await receiveCafeBatch(
      coffeeId,
      '2.000',
      '20.000000',
      new Date('2026-07-19T00:00:00.000Z'),
    );

    const created = await request(app())
      .post('/api/recipes')
      .set(adminAuthorization)
      .send({
        type: 'product',
        name: 'قهوة مخصوص',
        categoryId,
        sizes: [
          {
            name: 'صغير',
            sellingPrice: 50,
            ingredients: [{ itemId: coffeeId, quantity: 2 }],
          },
        ],
      });

    expect(created.status).toBe(201);
    const detail = await request(app())
      .get(`/api/recipes/${created.body.id}`)
      .set(adminAuthorization);

    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      id: created.body.id,
      type: 'product',
      name: 'قهوة مخصوص',
      categoryId,
      isActive: true,
    });
    expect(detail.body.sizes).toEqual([
      expect.objectContaining({
        name: 'صغير',
        sellingPrice: '50.00',
        currentCost: '30.00',
        marginAmount: '20.00',
        marginPercentage: '40.00',
        costPercentage: '60.00',
        hasSufficientStock: true,
        ingredients: [
          expect.objectContaining({
            itemId: coffeeId,
            requiredQuantity: '2.000',
            availableQuantity: '3.000',
            currentCost: '30.00',
          }),
        ],
      }),
    ]);
  });

  it('marks live cost and margin unavailable when any ingredient is short', async () => {
    const categoryId = await createLeafCategory();
    const milkId = await createItem(categoryId, 'لبن', 'raw', 'مل');
    await receiveCafeBatch(
      milkId,
      '0.500',
      '8.000000',
      new Date('2026-07-18T00:00:00.000Z'),
    );
    const created = await request(app())
      .post('/api/recipes')
      .set(adminAuthorization)
      .send({
        type: 'product',
        name: 'لاتيه',
        categoryId,
        sizes: [
          {
            name: 'كبير',
            sellingPrice: 40,
            ingredients: [{ itemId: milkId, quantity: 1 }],
          },
        ],
      });

    const detail = await request(app())
      .get(`/api/recipes/${created.body.id}`)
      .set(adminAuthorization);
    expect(detail.body.sizes[0]).toMatchObject({
      currentCost: null,
      marginAmount: null,
      marginPercentage: null,
      costPercentage: null,
      hasSufficientStock: false,
    });
  });

  it('reports a loss-making product size with correctly signed margins', async () => {
    const categoryId = await createLeafCategory();
    const itemId = await createItem(categoryId, 'مكوّن غالي');
    await receiveCafeBatch(
      itemId,
      '1.000',
      '12.345000',
      new Date('2026-07-18T00:00:00.000Z'),
    );
    const created = await request(app())
      .post('/api/recipes')
      .set(adminAuthorization)
      .send({
        type: 'product',
        name: 'منتج خاسر',
        categoryId,
        sizes: [
          {
            name: 'واحد',
            sellingPrice: 10,
            ingredients: [{ itemId, quantity: 1 }],
          },
        ],
      });

    const detail = await request(app())
      .get(`/api/recipes/${created.body.id}`)
      .set(adminAuthorization);
    expect(detail.body.sizes[0]).toMatchObject({
      currentCost: '12.35',
      marginAmount: '-2.35',
      marginPercentage: '-23.50',
      costPercentage: '123.50',
    });
  });

  it('rejects positive values smaller than the database quantity and money quanta', async () => {
    const categoryId = await createLeafCategory();
    const ingredientId = await createItem(categoryId, 'مكوّن');
    const firstOutputId = await createItem(categoryId, 'ناتج 1', 'prepared');
    const secondOutputId = await createItem(categoryId, 'ناتج 2', 'prepared');
    const productBody = {
      type: 'product',
      name: 'منتج',
      categoryId,
      sizes: [
        {
          name: 'واحد',
          sellingPrice: 10,
          ingredients: [{ itemId: ingredientId, quantity: 1 }],
        },
      ],
    };

    const tinyPrice = await request(app())
      .post('/api/recipes')
      .set(adminAuthorization)
      .send({
        ...productBody,
        sizes: [{ ...productBody.sizes[0], sellingPrice: 0.0000000005 }],
      });
    const tinyIngredient = await request(app())
      .post('/api/recipes')
      .set(adminAuthorization)
      .send({
        ...productBody,
        name: 'منتج 2',
        sizes: [
          {
            ...productBody.sizes[0],
            ingredients: [
              { itemId: ingredientId, quantity: 0.0000000005 },
            ],
          },
        ],
      });
    const tinyYield = await createPreparedRecipe({
      categoryId,
      outputItemId: firstOutputId,
      ingredientItemId: ingredientId,
      baseYield: 0.0000000005,
    });
    const validPrepared = await createPreparedRecipe({
      categoryId,
      outputItemId: secondOutputId,
      ingredientItemId: ingredientId,
      name: 'تحضير صالح',
    });
    const tinyPreparation = await request(app())
      .post(`/api/recipes/${validPrepared.body.id}/prepare`)
      .set(adminAuthorization)
      .send({ quantity: 0.0000000005 });

    expect(tinyPrice.status).toBe(400);
    expect(tinyIngredient.status).toBe(400);
    expect(tinyYield.status).toBe(400);
    expect(validPrepared.status).toBe(201);
    expect(tinyPreparation.status).toBe(400);
  });

  it('rounds exact FIFO cost once after aggregating ingredients and allocations', async () => {
    const categoryId = await createLeafCategory();
    const firstId = await createItem(categoryId, 'نقطة أ');
    const secondId = await createItem(categoryId, 'نقطة ب');
    const outputId = await createItem(categoryId, 'خليط نقط', 'prepared');
    await receiveCafeBatch(
      firstId,
      '0.001',
      '4.000000',
      new Date('2026-07-18T00:00:00.000Z'),
    );
    await receiveCafeBatch(
      secondId,
      '0.001',
      '4.000000',
      new Date('2026-07-18T00:00:00.000Z'),
    );

    const product = await request(app())
      .post('/api/recipes')
      .set(adminAuthorization)
      .send({
        type: 'product',
        name: 'تجميع كسور',
        categoryId,
        sizes: [
          {
            name: 'واحد',
            sellingPrice: 1,
            ingredients: [
              { itemId: firstId, quantity: 0.001 },
              { itemId: secondId, quantity: 0.001 },
            ],
          },
        ],
      });
    const productDetail = await request(app())
      .get(`/api/recipes/${product.body.id}`)
      .set(adminAuthorization);
    expect(productDetail.body.sizes[0]).toMatchObject({
      currentCost: '0.01',
      marginAmount: '0.99',
      costPercentage: '1.00',
    });

    const preparedRecipe = await request(app())
      .post('/api/recipes')
      .set(adminAuthorization)
      .send({
        type: 'prepared',
        name: 'خليط نقط',
        categoryId,
        outputItemId: outputId,
        baseYield: 1,
        ingredients: [
          { itemId: firstId, quantity: 0.001 },
          { itemId: secondId, quantity: 0.001 },
        ],
      });
    const prepared = await request(app())
      .post(`/api/recipes/${preparedRecipe.body.id}/prepare`)
      .set(adminAuthorization)
      .send({ quantity: 1 });
    const preparationDetail = await request(app())
      .get(`/api/recipes/preparations/${prepared.body.preparationId}`)
      .set(adminAuthorization);
    expect(preparationDetail.body).toMatchObject({
      totalCost: '0.01',
      unitCost: '0.008000',
    });
  });

  it('scales a prepared recipe, consumes cafe FIFO batches, and receives one costed output batch', async () => {
    const categoryId = await createLeafCategory('تجهيزات');
    const sugarId = await createItem(categoryId, 'سكر');
    const syrupId = await createItem(
      categoryId,
      'شربات',
      'prepared',
      'لتر',
    );
    const firstBatchId = await receiveCafeBatch(
      sugarId,
      '1.000',
      '10.000000',
      new Date('2026-07-18T00:00:00.000Z'),
    );
    const secondBatchId = await receiveCafeBatch(
      sugarId,
      '2.000',
      '20.000000',
      new Date('2026-07-19T00:00:00.000Z'),
    );
    const recipe = await createPreparedRecipe({
      categoryId,
      outputItemId: syrupId,
      ingredientItemId: sugarId,
      ingredientQuantity: 1,
      baseYield: 2,
    });
    expect(recipe.status).toBe(201);

    const prepared = await request(app())
      .post(`/api/recipes/${recipe.body.id}/prepare`)
      .set(adminAuthorization)
      .send({ quantity: 5, notes: 'تجهيز الوردية' });

    expect(prepared.status).toBe(201);
    const detail = await request(app())
      .get(`/api/recipes/preparations/${prepared.body.preparationId}`)
      .set(adminAuthorization);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      recipeId: recipe.body.id,
      recipeName: 'شربات سكر',
      outputItemId: syrupId,
      outputItemName: 'شربات',
      outputStockUnit: 'لتر',
      producedQuantity: '5.000',
      totalCost: '40.00',
      unitCost: '8.000000',
      preparedByName: 'مدير',
      notes: 'تجهيز الوردية',
    });
    expect(detail.body.allocations).toEqual([
      expect.objectContaining({
        ingredientItemId: sugarId,
        quantity: '1.000',
        unitCost: '10.000000',
        lineCost: '10.00',
        sourceBatchId: firstBatchId,
      }),
      expect.objectContaining({
        ingredientItemId: sugarId,
        quantity: '1.500',
        unitCost: '20.000000',
        lineCost: '30.00',
        sourceBatchId: secondBatchId,
      }),
    ]);

    const [outputBatch] = await db
      .select()
      .from(stockBatches)
      .where(
        and(
          eq(stockBatches.itemId, syrupId),
          eq(stockBatches.warehouse, 'cafe'),
        ),
      );
    expect(outputBatch).toMatchObject({
      initialQuantity: '5.000',
      remainingQuantity: '5.000',
      unitCost: '8.000000',
      sourceType: 'preparation_in',
      sourceId: prepared.body.preparationId,
    });
  });

  it('keeps long preparation notes without overflowing the stock movement', async () => {
    const categoryId = await createLeafCategory('تحضيرات طويلة');
    const ingredientId = await createItem(categoryId, 'مكوّن طويل');
    const outputId = await createItem(
      categoryId,
      'ناتج طويل',
      'prepared',
      'لتر',
    );
    await receiveCafeBatch(
      ingredientId,
      '2.000',
      '5.000000',
      new Date('2026-07-18T00:00:00.000Z'),
    );
    const recipe = await createPreparedRecipe({
      categoryId,
      outputItemId: outputId,
      ingredientItemId: ingredientId,
      ingredientQuantity: 1,
      baseYield: 1,
    });
    const notes = 'م'.repeat(2_000);

    const prepared = await request(app())
      .post(`/api/recipes/${recipe.body.id}/prepare`)
      .set(adminAuthorization)
      .send({ quantity: 1, notes });

    expect(prepared.status).toBe(201);
    const detail = await request(app())
      .get(`/api/recipes/preparations/${prepared.body.preparationId}`)
      .set(adminAuthorization);
    expect(detail.body.notes).toBe(notes);
    const [movement] = await db
      .select({ notes: stockMovements.notes })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.referenceType, 'preparation'),
          eq(stockMovements.referenceId, prepared.body.preparationId),
          eq(stockMovements.movementType, 'preparation_in'),
        ),
      );
    expect(movement.notes).toBeNull();
  });

  it('rolls an insufficient preparation back without stock or history changes', async () => {
    const categoryId = await createLeafCategory('تجهيزات');
    const ingredientId = await createItem(categoryId, 'فانيليا');
    const outputId = await createItem(categoryId, 'صوص', 'prepared', 'لتر');
    const inputBatchId = await receiveCafeBatch(
      ingredientId,
      '1.000',
      '15.000000',
      new Date('2026-07-18T00:00:00.000Z'),
    );
    const recipe = await createPreparedRecipe({
      categoryId,
      outputItemId: outputId,
      ingredientItemId: ingredientId,
      ingredientQuantity: 2,
      baseYield: 1,
    });

    const prepared = await request(app())
      .post(`/api/recipes/${recipe.body.id}/prepare`)
      .set(adminAuthorization)
      .send({ quantity: 1 });
    expect(prepared.status).toBe(409);

    const [inputBatch] = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.id, inputBatchId));
    expect(inputBatch.remainingQuantity).toBe('1.000');
    const history = await request(app())
      .get('/api/recipes/preparations')
      .set(adminAuthorization);
    expect(history.status).toBe(200);
    expect(history.body).toEqual([]);
  });

  it('rejects direct and indirect prepared-item recipe cycles', async () => {
    const categoryId = await createLeafCategory('تجهيزات');
    const firstId = await createItem(categoryId, 'قاعدة أ', 'prepared');
    const secondId = await createItem(categoryId, 'قاعدة ب', 'prepared');

    const direct = await createPreparedRecipe({
      categoryId,
      outputItemId: firstId,
      ingredientItemId: firstId,
    });
    expect(direct.status).toBe(409);

    const first = await createPreparedRecipe({
      categoryId,
      outputItemId: firstId,
      ingredientItemId: secondId,
      name: 'وصفة أ',
    });
    expect(first.status).toBe(201);
    const indirect = await createPreparedRecipe({
      categoryId,
      outputItemId: secondId,
      ingredientItemId: firstId,
      name: 'وصفة ب',
    });
    expect(indirect.status).toBe(409);
  });

  it('supports replacement edits, deactivation, and reactivation while enforcing admin access', async () => {
    const categoryId = await createLeafCategory();
    const itemId = await createItem(categoryId, 'كاكاو');
    const cashierCreate = await request(app())
      .post('/api/recipes')
      .set(cashierAuthorization)
      .send({
        type: 'product',
        name: 'موكا',
        categoryId,
        sizes: [
          {
            name: 'واحد',
            sellingPrice: 20,
            ingredients: [{ itemId, quantity: 1 }],
          },
        ],
      });
    expect(cashierCreate.status).toBe(403);

    const created = await request(app())
      .post('/api/recipes')
      .set(adminAuthorization)
      .send({
        type: 'product',
        name: 'موكا',
        categoryId,
        sizes: [
          {
            name: 'واحد',
            sellingPrice: 20,
            ingredients: [{ itemId, quantity: 1 }],
          },
        ],
      });
    const updated = await request(app())
      .put(`/api/recipes/${created.body.id}`)
      .set(adminAuthorization)
      .send({
        type: 'product',
        name: 'موكا غامق',
        categoryId,
        sizes: [
          {
            name: 'كبير',
            sellingPrice: 35,
            ingredients: [{ itemId, quantity: 1.5 }],
          },
        ],
      });
    expect(updated.status).toBe(200);

    expect(
      (
        await request(app())
          .delete(`/api/recipes/${created.body.id}`)
          .set(adminAuthorization)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app())
          .put(`/api/recipes/${created.body.id}/active`)
          .set(adminAuthorization)
      ).status,
    ).toBe(200);

    const detail = await request(app())
      .get(`/api/recipes/${created.body.id}`)
      .set(adminAuthorization);
    expect(detail.body).toMatchObject({ name: 'موكا غامق', isActive: true });
    expect(detail.body.sizes).toEqual([
      expect.objectContaining({
        name: 'كبير',
        sellingPrice: '35.00',
      }),
    ]);
  });

  it('protects active recipe categories and ingredients from deactivation', async () => {
    const recipeCategoryId = await createLeafCategory('مشروبات');
    const ingredientCategoryId = await createLeafCategory('خامات');
    const ingredientId = await createItem(ingredientCategoryId, 'مسحوق');
    const created = await request(app())
      .post('/api/recipes')
      .set(adminAuthorization)
      .send({
        type: 'product',
        name: 'مشروب',
        categoryId: recipeCategoryId,
        sizes: [
          {
            name: 'واحد',
            sellingPrice: 20,
            ingredients: [{ itemId: ingredientId, quantity: 1 }],
          },
        ],
      });

    const itemDeactivation = await request(app())
      .delete(`/api/items/${ingredientId}`)
      .set(adminAuthorization);
    const unitChange = await request(app())
      .put(`/api/items/${ingredientId}`)
      .set(adminAuthorization)
      .send({ stockUnit: 'كجم' });
    const categoryDeactivation = await request(app())
      .delete(`/api/categories/${recipeCategoryId}`)
      .set(adminAuthorization);
    expect(itemDeactivation.status).toBe(409);
    expect(unitChange.status).toBe(409);
    expect(categoryDeactivation.status).toBe(409);

    await request(app())
      .delete(`/api/recipes/${created.body.id}`)
      .set(adminAuthorization);
    expect(
      (
        await request(app())
          .delete(`/api/items/${ingredientId}`)
          .set(adminAuthorization)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app())
          .delete(`/api/categories/${recipeCategoryId}`)
          .set(adminAuthorization)
      ).status,
    ).toBe(200);
  });

  it('serializes competing preparation runs so cafe stock is consumed once', async () => {
    const categoryId = await createLeafCategory('تجهيزات');
    const ingredientId = await createItem(categoryId, 'مركز');
    const outputId = await createItem(categoryId, 'خلطة', 'prepared');
    await receiveCafeBatch(
      ingredientId,
      '1.000',
      '10.000000',
      new Date('2026-07-18T00:00:00.000Z'),
    );
    const recipe = await createPreparedRecipe({
      categoryId,
      outputItemId: outputId,
      ingredientItemId: ingredientId,
      ingredientQuantity: 1,
      baseYield: 1,
    });

    const results = await Promise.all([
      request(app())
        .post(`/api/recipes/${recipe.body.id}/prepare`)
        .set(adminAuthorization)
        .send({ quantity: 1 }),
      request(app())
        .post(`/api/recipes/${recipe.body.id}/prepare`)
        .set(adminAuthorization)
        .send({ quantity: 1 }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);

    const history = await request(app())
      .get('/api/recipes/preparations')
      .set(adminAuthorization);
    expect(history.body).toHaveLength(1);
  });
});
