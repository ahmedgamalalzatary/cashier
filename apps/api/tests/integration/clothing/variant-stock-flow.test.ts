import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../src/app.js";
import { appOptions, db } from "../../support/setup.js";
import { loginAs } from "../../support/helpers.js";

const app = () => createApp(db, appOptions);

describe("clothing variant stock flow", () => {
  let admin: { readonly Authorization: string };

  beforeEach(async () => {
    admin = await loginAs(app(), "admin");
  });

  it("keeps purchase, transfer, and sale stock isolated per variant", async () => {
    const category = await request(app())
      .post("/api/categories")
      .set(admin)
      .send({
        name: "تي شيرت",
        colors: ["أسود", "أبيض"],
        sizes: ["M"],
      });
    expect(category.status).toBe(201);

    const categories = await request(app()).get("/api/categories").set(admin);
    const createdCategory = categories.body.find(
      (row: { id: number }) => row.id === category.body.id,
    );
    const [black, white] = createdCategory.colors;
    const [medium] = createdCategory.sizes;

    const product = await request(app())
      .post("/api/items")
      .set(admin)
      .send({
        name: "تي شيرت قطن",
        categoryId: category.body.id,
        variants: [
          {
            colorId: black.id,
            sizeId: medium.id,
            barcode: "BLACK-M",
            sellingPrice: 100,
          },
          {
            colorId: white.id,
            sizeId: medium.id,
            barcode: "WHITE-M",
            sellingPrice: 110,
          },
        ],
      });
    expect(product.status).toBe(201);

    const products = await request(app()).get("/api/items").set(admin);
    const variants = products.body.find(
      (row: { id: number }) => row.id === product.body.id,
    ).variants;
    const blackVariant = variants.find(
      (row: { barcode: string }) => row.barcode === "BLACK-M",
    );
    const whiteVariant = variants.find(
      (row: { barcode: string }) => row.barcode === "WHITE-M",
    );

    const supplier = await request(app())
      .post("/api/suppliers")
      .set(admin)
      .send({ name: "مورد الملابس", openingBalance: 0 });
    expect(supplier.status).toBe(201);

    const purchase = await request(app())
      .post("/api/purchases")
      .set(admin)
      .send({
        supplierId: supplier.body.id,
        purchasedAt: "2026-07-28",
        paidAmount: 0,
        lines: [
          { variantId: blackVariant.id, quantity: 5, unitPrice: 40 },
          { variantId: whiteVariant.id, quantity: 7, unitPrice: 45 },
        ],
      });
    expect(purchase.status).toBe(201);

    const transfer = await request(app())
      .post("/api/transfers/direct")
      .set(admin)
      .send({
        notes: null,
        lines: [{ variantId: blackVariant.id, quantity: 3 }],
      });
    expect(transfer.status).toBe(201);

    const cashier = await loginAs(app(), "cashier");
    expect(
      (
        await request(app())
          .post("/api/shifts/open")
          .set(cashier)
          .send({ openingFloat: 0 })
      ).status,
    ).toBe(201);
    const sale = await request(app())
      .post("/api/orders")
      .set(cashier)
      .send({
        clientRequestId: crypto.randomUUID(),
        lines: [{ variantId: blackVariant.id, quantity: 2 }],
        cashReceived: 200,
      });
    expect(sale.status).toBe(201);

    const mainStock = (
      await request(app()).get("/api/inventory/main/stock").set(admin)
    ).body;
    const shopStock = (
      await request(app()).get("/api/inventory/shop/stock").set(cashier)
    ).body;
    expect(
      mainStock.find(
        (row: { itemId: number }) => row.itemId === blackVariant.id,
      ).quantity,
    ).toBe("2.000");
    expect(
      mainStock.find(
        (row: { itemId: number }) => row.itemId === whiteVariant.id,
      ).quantity,
    ).toBe("7.000");
    expect(
      shopStock.find(
        (row: { itemId: number }) => row.itemId === blackVariant.id,
      ).quantity,
    ).toBe("1.000");
    expect(
      shopStock.find(
        (row: { itemId: number }) => row.itemId === whiteVariant.id,
      ).quantity,
    ).toBe("0.000");
  });
});
