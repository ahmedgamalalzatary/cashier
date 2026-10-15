import { it, testId } from "../support/ids.js";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import {
  categories,
  expenseCategories,
  expenses,
  items,
  preparationAllocations,
  preparations,
  recipes,
  stockBatches,
  transferLines,
  transferRequestLines,
  transferRequests,
  transfers,
  users,
} from "@cashier/db";
import { db, nextTestItemCode } from "../support/api-setup.js";
import { loginAs } from "../support/api-helpers.js";
import {
  app,
  createExternalCategoryFixture,
  sellLatte,
} from "../support/reports-fixtures.js";

describe("reports", () => {
  it("reports branch-scoped transfers, preparations and expenses with detail and responsible staff", async () => {
    const auth = await loginAs(app, "admin");
    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.username, "admin"));
    const other = await request(app)
      .post("/api/branches")
      .set(auth)
      .send({ name: "Other" })
      .expect(201);
    for (const branchId of [testId(1), other.body.id as string]) {
      const [category] = await db
        .insert(categories)
        .values({ branchId, name: "Materials" })
        .$returningId();
      const [item] = await db
        .insert(items)
        .values({
          branchId,
          code: nextTestItemCode(),
          name: "Flour",
          categoryId: category.id,
          type: "raw",
          stockUnit: "kg",
        })
        .$returningId();
      const [batch] = await db
        .insert(stockBatches)
        .values({
          branchId,
          itemId: item.id,
          warehouse: "main",
          initialQuantity: "10.000",
          remainingQuantity: "5.000",
          unitCost: "4.000000",
          receivedAt: new Date("2026-09-01T08:00:00Z"),
          sourceType: "purchase",
        })
        .$returningId();
      const [recipe] = await db
        .insert(recipes)
        .values({
          branchId,
          name: "Dough",
          type: "prepared",
          categoryId: category.id,
          outputItemId: item.id,
        })
        .$returningId();
      const [expenseCategory] = await db
        .insert(expenseCategories)
        .values({ branchId, name: "Transport" })
        .$returningId();
      for (const occurredAt of [
        new Date("2026-09-11T08:00:00Z"),
        new Date("2026-09-12T08:00:00Z"),
      ]) {
        const [tr] = await db
          .insert(transferRequests)
          .values({
            branchId,
            requestedBy: admin.id,
            reviewedBy: admin.id,
            status: "approved",
            clientRequestId: randomUUID(),
            requestFingerprint: "fixture",
            createdAt: occurredAt,
            reviewedAt: occurredAt,
          })
          .$returningId();
        await db.insert(transferRequestLines).values({
          branchId,
          requestId: tr.id,
          itemId: item.id,
          quantity: "3.000",
        });
        const [transfer] = await db
          .insert(transfers)
          .values({
            branchId,
            requestId: tr.id,
            createdBy: admin.id,
            approvedBy: admin.id,
            createdAt: occurredAt,
          })
          .$returningId();
        for (const [quantity, unitCost] of [
          ["1.000", "4.000000"],
          ["2.000", "5.000000"],
        ]) {
          const [cafeBatch] = await db
            .insert(stockBatches)
            .values({
              branchId,
              itemId: item.id,
              warehouse: "cafe",
              initialQuantity: quantity,
              remainingQuantity: quantity,
              unitCost,
              receivedAt: occurredAt,
              sourceType: "transfer_in",
            })
            .$returningId();
          await db.insert(transferLines).values({
            branchId,
            transferId: transfer.id,
            itemId: item.id,
            quantity,
            unitCost,
            sourceBatchId: batch.id,
            cafeBatchId: cafeBatch.id,
          });
        }
        const [prep] = await db
          .insert(preparations)
          .values({
            branchId,
            recipeId: recipe.id,
            recipeName: "Dough",
            outputItemId: item.id,
            outputItemName: "Prepared dough",
            producedQuantity: "2.000",
            totalCost: "8.00",
            unitCost: "4.000000",
            preparedBy: admin.id,
            occurredAt,
          })
          .$returningId();
        await db.insert(preparationAllocations).values({
          branchId,
          preparationId: prep.id,
          ingredientItemId: item.id,
          ingredientItemName: "Flour",
          quantity: "2.000",
          unitCost: "4.000000",
          sourceBatchId: batch.id,
        });
        await db.insert(expenses).values({
          branchId,
          clientRequestId: randomUUID(),
          requestFingerprint: "fixture",
          type: "general",
          categoryId: expenseCategory.id,
          amount: "7.00",
          expenseDate: occurredAt.toISOString().slice(0, 10),
          recordedBy: admin.id,
        });
      }
    }
    const report = await request(app)
      .get("/api/reports?from=2026-09-11&to=2026-09-11")
      .set(auth)
      .expect(200);
    expect(report.body.operations?.transfers).toHaveLength(1);
    expect(Number(report.body.operations.transfers[0].totalCost)).toBe(14);
    expect(Number(report.body.operations.transfers[0].itemCount)).toBe(1);
    expect(report.body.operations.transferLines).toHaveLength(1);
    expect(Number(report.body.operations.transferLines[0].quantity)).toBe(3);
    expect(report.body.operations.requests).toHaveLength(1);
    expect(report.body.operations.requests[0].status).toBe("approved");
    expect(report.body.operations.requestLines).toHaveLength(1);
    expect(report.body.operations.preparations).toHaveLength(1);
    expect(report.body.operations.preparations[0].preparedByName).toBe("مدير");
    expect(Number(report.body.operations.preparations[0].totalCost)).toBe(8);
    expect(report.body.operations.ingredients).toHaveLength(1);
    expect(report.body.money.expenses).toHaveLength(1);
    expect(report.body.money.expenses[0].recordedByName).toBe("مدير");
    expect(Number(report.body.money.expenses[0].amount)).toBe(7);
    const otherReport = await request(app)
      .get("/api/reports?from=2026-09-11&to=2026-09-11")
      .set(auth)
      .set("X-Branch-Id", String(other.body.id))
      .expect(200);
    expect(otherReport.body.operations.transfers).toHaveLength(1);
    expect(otherReport.body.operations.transfers[0].id).not.toBe(
      report.body.operations.transfers[0].id,
    );
    expect(otherReport.body.operations.ingredients[0].preparationId).not.toBe(
      report.body.operations.ingredients[0].preparationId,
    );
  });

  it("counts an external-product sale under its external category", async () => {
    const adminAuthorization = await loginAs(app, "admin");
    const cashierAuthorization = await loginAs(app, "cashier");
    await request(app)
      .post("/api/shifts/open")
      .set(cashierAuthorization)
      .send({ openingFloat: 0 });
    await createExternalCategoryFixture();
    await sellLatte(cashierAuthorization);

    const report = await request(app)
      .get("/api/reports?from=2026-01-01&to=2026-12-31")
      .set(adminAuthorization);

    expect(report.status).toBe(200);
    const rows = report.body.sales.byCategory;
    expect(rows).toHaveLength(1);
    expect(rows[0].mainCategory).toBe("مشروبات");
    expect(rows[0].category).toBe("مشروبات");
    expect(Number(rows[0].sales)).toBeCloseTo(160, 6);
    expect(Number(rows[0].refunds)).toBe(0);
    expect(Number(rows[0].cost)).toBeCloseTo(0.4, 6);
    expect(Number(rows[0].returnedCost)).toBe(0);
    expect(Number(rows[0].profit)).toBeCloseTo(159.6, 6);
  });

  it("counts an external-product refund under the same external category", async () => {
    const adminAuthorization = await loginAs(app, "admin");
    const cashierAuthorization = await loginAs(app, "cashier");
    await request(app)
      .post("/api/shifts/open")
      .set(cashierAuthorization)
      .send({ openingFloat: 0 });
    await createExternalCategoryFixture();
    const sale = await sellLatte(cashierAuthorization);

    const refund = await request(app)
      .post("/api/refunds")
      .set(cashierAuthorization)
      .send({
        clientRequestId: randomUUID(),
        orderId: sale.id,
        reason: "طلب العميل",
        lines: [
          {
            orderLineId: sale.lines[0].id,
            quantity: 1,
            stockAction: "not_returnable",
          },
        ],
      });
    expect(refund.status).toBe(201);

    const report = await request(app)
      .get("/api/reports?from=2026-01-01&to=2026-12-31")
      .set(adminAuthorization);

    expect(report.status).toBe(200);
    const rows = report.body.sales.byCategory;
    expect(rows).toHaveLength(1);
    expect(rows[0].mainCategory).toBe("مشروبات");
    expect(rows[0].category).toBe("مشروبات");
    expect(Number(rows[0].sales)).toBeCloseTo(160, 6);
    expect(Number(rows[0].refunds)).toBeCloseTo(80, 6);
    expect(Number(rows[0].returnedCost)).toBe(0);
    expect(Number(rows[0].profit)).toBeCloseTo(79.6, 6);
  });
});
