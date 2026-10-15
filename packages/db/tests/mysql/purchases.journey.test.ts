import { beforeEach, it, testId, testBranchValues } from "../support/ids.js";
import { describe, expect } from "vitest";
import request from "supertest";
import {
  categories,
  items,
  stockDeficitAllocations,
  suppliers,
} from "@cashier/db";
import { db, nextTestItemCode } from "../support/api-setup.js";
import { loginAs } from "../support/api-helpers.js";
import { app } from "../support/purchases-fixtures.js";

let authorization: { readonly Authorization: string };

beforeEach(async () => {
  authorization = await loginAs(app(), "admin");
});

describe("purchase invoice journey", () => {
  it("follows the invoice's stock to sales, refunds, waste and what is left", async () => {
    const cashier = await loginAs(app(), "cashier");
    await request(app())
      .post("/api/shifts/open")
      .set(cashier)
      .send({ openingFloat: 100 });
    const [supplier] = await db
      .insert(suppliers)
      .values(testBranchValues({ name: "مورد المياه" }))
      .$returningId();
    const [category] = await db
      .insert(categories)
      .values(testBranchValues({ name: "مياه" }))
      .$returningId();
    const [item] = await db
      .insert(items)
      .values(
        testBranchValues({
          code: nextTestItemCode(),
          name: "مياه",
          categoryId: category.id,
          type: "resale",
          stockUnit: "قطعة",
          sellingPrice: "10.00",
        }),
      )
      .$returningId();
    const sell = (
      quantity: number,
      discount: { type: "fixed"; value: number } | null,
    ) =>
      request(app())
        .post("/api/orders")
        .set(cashier)
        .send({
          clientRequestId: crypto.randomUUID(),
          lines: [{ type: "item", itemId: item.id, quantity }],
          discount,
          cashReceived: 100,
        });

    // sold before any stock existed; this invoice's cafe transfer settles it
    expect((await sell(1, null)).status).toBe(201);
    const invoice = await request(app())
      .post("/api/purchases")
      .set(authorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        supplierId: supplier.id,
        invoiceNumber: "J-1",
        purchasedAt: "2026-07-20",
        paidAmount: 0,
        notes: null,
        lines: [
          {
            itemId: item.id,
            quantity: 10,
            unitMode: "stock",
            unitPrice: 4,
            toCafeQuantity: 6,
          },
        ],
      });
    expect(invoice.status).toBe(201);
    // 3 × 10 with 5 off → 25 paid
    const order = await sell(3, { type: "fixed", value: 5 });
    expect(order.status).toBe(201);
    const refund = await request(app())
      .post("/api/refunds")
      .set(cashier)
      .send({
        clientRequestId: crypto.randomUUID(),
        orderId: order.body.id,
        reason: "طلب العميل",
        lines: [
          {
            orderLineId: order.body.lines[0].id,
            quantity: 1,
            stockAction: "return_to_stock",
          },
        ],
      });
    expect(refund.status).toBe(201);
    const waste = await request(app())
      .post("/api/waste")
      .set(cashier)
      .send({
        clientRequestId: crypto.randomUUID(),
        warehouse: "cafe",
        target: { type: "item", itemId: item.id },
        quantity: 1,
        reason: "damaged",
      });
    expect(waste.status).toBe(201);

    const journey = await request(app())
      .get(`/api/purchases/${invoice.body.id}/journey`)
      .set(authorization);

    expect(journey.status).toBe(200);
    // 40 bought = 12 sold + 4 wasted + 16 main + 8 cafe
    expect(journey.body.totals).toEqual({
      boughtCost: "40.00",
      soldCost: "12.00",
      salesAmount: "35.00",
      refundedAmount: "8.33",
      profit: "14.67",
      wastedCost: "4.00",
      shortageCost: "0.00",
      mainStockCost: "16.00",
      cafeStockCost: "8.00",
      preparedStockCost: "0.00",
    });
    expect(journey.body.lines).toEqual([
      expect.objectContaining({
        itemId: item.id,
        itemName: "مياه",
        stockUnit: "قطعة",
        boughtQuantity: "10.000",
        soldQuantity: "3.000",
        wastedQuantity: "1.000",
        mainStockQuantity: "4.000",
        cafeStockQuantity: "2.000",
        unmatchedSaleQuantity: "0.000",
      }),
    ]);
    expect(journey.body.products).toEqual([
      expect.objectContaining({
        productName: "مياه",
        quantity: "3.000",
        salesAmount: "35.00",
      }),
    ]);

    const cashierView = await request(app())
      .get(`/api/purchases/${invoice.body.id}/journey`)
      .set(cashier);
    expect(cashierView.status).toBe(403);
    const missing = await request(app())
      .get(`/api/purchases/${testId(999)}/journey`)
      .set(authorization);
    expect(missing.status).toBe(404);
  });

  it("follows a purchase that settles a transfer shortage into the cafe", async () => {
    const cashier = await loginAs(app(), "cashier");
    await request(app())
      .post("/api/shifts/open")
      .set(cashier)
      .send({ openingFloat: 100 });
    const [supplier] = await db
      .insert(suppliers)
      .values(testBranchValues({ name: "مورد" }))
      .$returningId();
    const [category] = await db
      .insert(categories)
      .values(testBranchValues({ name: "خامات" }))
      .$returningId();
    const [item] = await db
      .insert(items)
      .values(
        testBranchValues({
          code: nextTestItemCode(),
          name: "سكر",
          categoryId: category.id,
          type: "raw",
          stockUnit: "كجم",
        }),
      )
      .$returningId();
    const buyMain = (
      quantity: number,
      unitPrice: number,
      invoiceNumber: string,
    ) =>
      request(app())
        .post("/api/purchases")
        .set(authorization)
        .send({
          clientRequestId: crypto.randomUUID(),
          supplierId: supplier.id,
          invoiceNumber,
          purchasedAt: "2026-07-20",
          paidAmount: 0,
          notes: null,
          lines: [
            {
              itemId: item.id,
              quantity,
              unitMode: "stock",
              unitPrice,
              toCafeQuantity: 0,
            },
          ],
        });

    // main has 2 @10; transferring 3 to the cafe takes main to -1
    expect((await buyMain(2, 10, "T-1")).status).toBe(201);
    const created = await request(app())
      .post("/api/transfers/requests")
      .set(cashier)
      .send({
        clientRequestId: crypto.randomUUID(),
        lines: [{ itemId: item.id, quantity: 3 }],
      });
    const approved = await request(app())
      .post(`/api/transfers/requests/${created.body.id}/approve`)
      .set(authorization)
      .send({ lines: [{ itemId: item.id, quantity: 3 }] });
    expect(approved.status).toBe(201);

    // 1 @25 arrives in main and settles the transfer_out deficit
    const settling = await buyMain(1, 25, "T-2");
    expect(settling.status).toBe(201);
    expect(await db.select().from(stockDeficitAllocations)).toHaveLength(1);

    const journey = await request(app())
      .get(`/api/purchases/${settling.body.id}/journey`)
      .set(authorization);

    expect(journey.status).toBe(200);
    // the whole bought unit is now cafe stock, costed at what was paid
    expect(journey.body.lines).toEqual([
      expect.objectContaining({
        itemId: item.id,
        boughtQuantity: "1.000",
        boughtCost: "25.00",
        mainStockQuantity: "0.000",
        mainStockCost: "0.00",
        cafeStockQuantity: "1.000",
        cafeStockCost: "25.00",
      }),
    ]);
    expect(journey.body.totals).toMatchObject({
      boughtCost: "25.00",
      mainStockCost: "0.00",
      cafeStockCost: "25.00",
    });
  });

  it("splits one transfer shortage across several receipts by what each settled", async () => {
    const cashier = await loginAs(app(), "cashier");
    await request(app())
      .post("/api/shifts/open")
      .set(cashier)
      .send({ openingFloat: 100 });
    const [supplier] = await db
      .insert(suppliers)
      .values(testBranchValues({ name: "مورد" }))
      .$returningId();
    const [category] = await db
      .insert(categories)
      .values(testBranchValues({ name: "خامات" }))
      .$returningId();
    const [item] = await db
      .insert(items)
      .values(
        testBranchValues({
          code: nextTestItemCode(),
          name: "دقيق",
          categoryId: category.id,
          type: "raw",
          stockUnit: "كجم",
        }),
      )
      .$returningId();
    const buyMain = (
      quantity: number,
      unitPrice: number,
      invoiceNumber: string,
    ) =>
      request(app())
        .post("/api/purchases")
        .set(authorization)
        .send({
          clientRequestId: crypto.randomUUID(),
          supplierId: supplier.id,
          invoiceNumber,
          purchasedAt: "2026-07-20",
          paidAmount: 0,
          notes: null,
          lines: [
            {
              itemId: item.id,
              quantity,
              unitMode: "stock",
              unitPrice,
              toCafeQuantity: 0,
            },
          ],
        });

    // main is empty; transferring 3 takes it to -3 and fills a cafe batch of 3
    const created = await request(app())
      .post("/api/transfers/requests")
      .set(cashier)
      .send({
        clientRequestId: crypto.randomUUID(),
        lines: [{ itemId: item.id, quantity: 3 }],
      });
    const approved = await request(app())
      .post(`/api/transfers/requests/${created.body.id}/approve`)
      .set(authorization)
      .send({ lines: [{ itemId: item.id, quantity: 3 }] });
    expect(approved.status).toBe(201);

    // two later receipts settle 1 then 2 of the 3-unit shortage
    const first = await buyMain(1, 10, "S-1");
    const second = await buyMain(2, 20, "S-2");
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const allocations = await db.select().from(stockDeficitAllocations);
    expect(allocations).toHaveLength(2);

    const firstJourney = await request(app())
      .get(`/api/purchases/${first.body.id}/journey`)
      .set(authorization);
    expect(firstJourney.status).toBe(200);
    expect(firstJourney.body.lines[0]).toMatchObject({
      boughtQuantity: "1.000",
      boughtCost: "10.00",
      cafeStockQuantity: "1.000",
      cafeStockCost: "10.00",
    });

    const secondJourney = await request(app())
      .get(`/api/purchases/${second.body.id}/journey`)
      .set(authorization);
    expect(secondJourney.status).toBe(200);
    expect(secondJourney.body.lines[0]).toMatchObject({
      boughtQuantity: "2.000",
      boughtCost: "40.00",
      cafeStockQuantity: "2.000",
      cafeStockCost: "40.00",
    });

    // the transfer keeps its original, estimated cost
    const detail = await request(app())
      .get(`/api/transfers/${approved.body.transferId}`)
      .set(authorization);
    expect(detail.body.totalCost).toBe("0.00");
    expect(detail.body.lines[0]).toMatchObject({
      quantity: "3.000",
      unitCost: "0.000000",
      sourceBatchId: null,
    });
  });

  it("follows a purchase that settles a preparation shortage into the prepared batch", async () => {
    const [supplier] = await db
      .insert(suppliers)
      .values(testBranchValues({ name: "مورد" }))
      .$returningId();
    const [category] = await db
      .insert(categories)
      .values(testBranchValues({ name: "تحضيرات" }))
      .$returningId();
    const [ingredient] = await db
      .insert(items)
      .values(
        testBranchValues({
          code: nextTestItemCode(),
          name: "حليب",
          categoryId: category.id,
          type: "raw",
          stockUnit: "لتر",
        }),
      )
      .$returningId();
    const [output] = await db
      .insert(items)
      .values(
        testBranchValues({
          code: nextTestItemCode(),
          name: "كاسترد",
          categoryId: category.id,
          type: "prepared",
          stockUnit: "لتر",
        }),
      )
      .$returningId();
    const recipe = await request(app())
      .post("/api/recipes")
      .set(authorization)
      .send({
        type: "prepared",
        name: "كاسترد",
        categoryId: category.id,
        outputItemId: output.id,
        baseYield: 1,
        ingredients: [{ itemId: ingredient.id, quantity: 2 }],
      });
    expect(recipe.status).toBe(201);

    // preparing with no cafe milk makes a 2-unit preparation_out deficit
    const prepared = await request(app())
      .post(`/api/recipes/${recipe.body.id}/prepare`)
      .set(authorization)
      .send({ quantity: 1 });
    expect(prepared.status).toBe(201);

    // buying 2 and sending them all to the cafe settles that deficit
    const invoice = await request(app())
      .post("/api/purchases")
      .set(authorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        supplierId: supplier.id,
        invoiceNumber: "P-1",
        purchasedAt: "2026-07-20",
        paidAmount: 0,
        notes: null,
        lines: [
          {
            itemId: ingredient.id,
            quantity: 2,
            unitMode: "stock",
            unitPrice: 10,
            toCafeQuantity: 2,
          },
        ],
      });
    expect(invoice.status).toBe(201);
    expect(await db.select().from(stockDeficitAllocations)).toHaveLength(1);

    const journey = await request(app())
      .get(`/api/purchases/${invoice.body.id}/journey`)
      .set(authorization);

    expect(journey.status).toBe(200);
    // the bought milk became the prepared output, costed at what was paid
    const line = journey.body.lines.find(
      (row: { itemId: string }) => row.itemId === ingredient.id,
    );
    expect(line).toMatchObject({
      boughtQuantity: "2.000",
      boughtCost: "20.00",
      mainStockQuantity: "0.000",
      cafeStockQuantity: "0.000",
      preparedStockQuantity: "2.000",
      preparedStockCost: "20.00",
    });
  });

  it("attributes sale revenue to a settled shortage at the recorded cost, not the receipt cost", async () => {
    const cashier = await loginAs(app(), "cashier");
    await request(app())
      .post("/api/shifts/open")
      .set(cashier)
      .send({ openingFloat: 100 });
    const [supplier] = await db
      .insert(suppliers)
      .values(testBranchValues({ name: "مورد" }))
      .$returningId();
    const [category] = await db
      .insert(categories)
      .values(testBranchValues({ name: "خامات" }))
      .$returningId();
    const [item] = await db
      .insert(items)
      .values(
        testBranchValues({
          code: nextTestItemCode(),
          name: "لبن",
          categoryId: category.id,
          type: "resale",
          stockUnit: "لتر",
          sellingPrice: "50.00",
        }),
      )
      .$returningId();
    const buyMain = (
      quantity: number,
      unitPrice: number,
      invoiceNumber: string,
    ) =>
      request(app())
        .post("/api/purchases")
        .set(authorization)
        .send({
          clientRequestId: crypto.randomUUID(),
          supplierId: supplier.id,
          invoiceNumber,
          purchasedAt: "2026-07-20",
          paidAmount: 0,
          notes: null,
          lines: [
            {
              itemId: item.id,
              quantity,
              unitMode: "stock",
              unitPrice,
              toCafeQuantity: 0,
            },
          ],
        });

    // main gets 2 @10, then is emptied, leaving 10 as the item's last known cost
    expect((await buyMain(2, 10, "C-1")).status).toBe(201);
    const wasted = await request(app())
      .post("/api/waste")
      .set(authorization)
      .send({
        clientRequestId: crypto.randomUUID(),
        warehouse: "main",
        target: { type: "item", itemId: item.id },
        quantity: 2,
        reason: "damaged",
      });
    expect(wasted.status).toBe(201);

    // transferring 2 to the cafe takes main to -2, costed at the last known cost (10)
    const created = await request(app())
      .post("/api/transfers/requests")
      .set(cashier)
      .send({
        clientRequestId: crypto.randomUUID(),
        lines: [{ itemId: item.id, quantity: 2 }],
      });
    const approved = await request(app())
      .post(`/api/transfers/requests/${created.body.id}/approve`)
      .set(authorization)
      .send({ lines: [{ itemId: item.id, quantity: 2 }] });
    expect(approved.status).toBe(201);

    // a receipt at 25 settles the shortage, but the cafe keeps its 10 estimate
    const settling = await buyMain(2, 25, "C-2");
    expect(settling.status).toBe(201);
    expect(await db.select().from(stockDeficitAllocations)).toHaveLength(1);

    // sell both cafe units for 100, then refund one
    const order = await request(app())
      .post("/api/orders")
      .set(cashier)
      .send({
        clientRequestId: crypto.randomUUID(),
        lines: [{ type: "item", itemId: item.id, quantity: 2 }],
        discount: null,
        cashReceived: 100,
      });
    expect(order.status).toBe(201);
    const refund = await request(app())
      .post("/api/refunds")
      .set(cashier)
      .send({
        clientRequestId: crypto.randomUUID(),
        orderId: order.body.id,
        reason: "طلب العميل",
        lines: [
          {
            orderLineId: order.body.lines[0].id,
            quantity: 1,
            stockAction: "return_to_stock",
          },
        ],
      });
    expect(refund.status).toBe(201);

    const journey = await request(app())
      .get(`/api/purchases/${settling.body.id}/journey`)
      .set(authorization);

    expect(journey.status).toBe(200);
    // 2 sold for 100; the invoice's 25/unit is its cost, not a revenue multiplier.
    // 1 refunded at 50 leaves 100 sales - 50 refunded - 25 cost = 25 profit.
    expect(journey.body.totals).toMatchObject({
      boughtCost: "50.00",
      soldCost: "25.00",
      salesAmount: "100.00",
      refundedAmount: "50.00",
      profit: "25.00",
    });
  });
});
