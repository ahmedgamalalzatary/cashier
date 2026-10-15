import { beforeEach, it } from "../support/ids.js";
import { describe, expect } from "vitest";
import request from "supertest";
import { transferRequests } from "@cashier/db";
import { db } from "../support/api-setup.js";
import {
  app,
  createItem,
  createRequest,
  loginSecondCashier,
  setupCafeSession,
} from "../support/transfers-fixtures.js";

let adminAuthorization: { readonly Authorization: string };
let cashierAuthorization: { readonly Authorization: string };
let openedShiftId: string;

beforeEach(async () => {
  ({ adminAuthorization, cashierAuthorization, openedShiftId } =
    await setupCafeSession());
});

describe("cafe transfer requests", () => {
  it("lets cashiers create requests and lets every cashier see them", async () => {
    const itemId = await createItem();
    const created = await createRequest(cashierAuthorization, itemId, 3.5);
    expect(created.status).toBe(201);

    const secondCashierAuthorization = await loginSecondCashier();
    const list = await request(app())
      .get("/api/transfers/requests")
      .set(secondCashierAuthorization);

    expect(list.status).toBe(200);
    expect(list.body).toEqual([
      expect.objectContaining({
        id: created.body.id,
        status: "pending",
        requestedByName: "كاشير",
        notes: "احتياج الوردية",
        lineCount: 1,
      }),
    ]);

    const detail = await request(app())
      .get(`/api/transfers/requests/${created.body.id}`)
      .set(secondCashierAuthorization);
    expect(detail.status).toBe(200);
    expect(detail.body.shiftId).toBe(openedShiftId);
    expect(detail.body.lines).toEqual([
      expect.objectContaining({ itemId, itemName: "بن", quantity: "3.500" }),
    ]);
    const shift = await request(app())
      .get("/api/shifts/current")
      .set(cashierAuthorization);
    expect(shift.body.totals.transferRequests).toBe(1);
  });

  it("requires the cashier open shift and links the request to it", async () => {
    const itemId = await createItem();
    await request(app())
      .post(`/api/shifts/${openedShiftId}/close`)
      .set(cashierAuthorization)
      .send({ actualCash: 0 });

    const response = await createRequest(cashierAuthorization, itemId);

    expect(response.status).toBe(409);
    expect(await db.select().from(transferRequests)).toEqual([]);
  });

  it("allows an admin request without pretending it belongs to a shift", async () => {
    const itemId = await createItem();

    const created = await createRequest(adminAuthorization, itemId);
    const detail = await request(app())
      .get(`/api/transfers/requests/${created.body.id}`)
      .set(adminAuthorization);

    expect(created.status).toBe(201);
    expect(detail.body.shiftId).toBeNull();
  });

  it("serializes a cashier request with a concurrent shift close", async () => {
    const itemId = await createItem();

    const [created, closed] = await Promise.all([
      createRequest(cashierAuthorization, itemId),
      request(app())
        .post(`/api/shifts/${openedShiftId}/close`)
        .set(cashierAuthorization)
        .send({ actualCash: 0 }),
    ]);

    expect(closed.status).toBe(200);
    expect([201, 409]).toContain(created.status);
    if (created.status === 201) {
      const detail = await request(app())
        .get(`/api/transfers/requests/${created.body.id}`)
        .set(cashierAuthorization);
      expect(detail.body.shiftId).toBe(openedShiftId);
    }
  });

  it("allows only admins to reject pending requests and records the reason", async () => {
    const itemId = await createItem();
    const created = await createRequest(cashierAuthorization, itemId, 1);

    const forbidden = await request(app())
      .post(`/api/transfers/requests/${created.body.id}/reject`)
      .set(cashierAuthorization)
      .send({ reason: "الرصيد غير مطلوب" });
    expect(forbidden.status).toBe(403);

    const rejected = await request(app())
      .post(`/api/transfers/requests/${created.body.id}/reject`)
      .set(adminAuthorization)
      .send({ reason: "الرصيد غير مطلوب" });
    expect(rejected.status).toBe(200);

    const detail = await request(app())
      .get(`/api/transfers/requests/${created.body.id}`)
      .set(cashierAuthorization);
    expect(detail.body).toMatchObject({
      status: "rejected",
      rejectionReason: "الرصيد غير مطلوب",
      reviewedByName: "مدير",
    });

    const approveRejected = await request(app())
      .post(`/api/transfers/requests/${created.body.id}/approve`)
      .set(adminAuthorization)
      .send({ lines: [{ itemId, quantity: 1 }] });
    expect(approveRejected.status).toBe(409);
  });

  it("replays the same clientRequestId without duplicating the request, and 409s on a changed payload", async () => {
    const itemId = await createItem();
    const body = {
      clientRequestId: crypto.randomUUID(),
      notes: "احتياج الوردية",
      lines: [{ itemId, quantity: 2 }],
    };

    const first = await request(app())
      .post("/api/transfers/requests")
      .set(cashierAuthorization)
      .send(body);
    expect(first.status).toBe(201);

    // a retry with the same key returns the original request, not a duplicate
    const replay = await request(app())
      .post("/api/transfers/requests")
      .set(cashierAuthorization)
      .send(body);
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(first.body.id);
    expect(await db.select().from(transferRequests)).toHaveLength(1);

    // the same key with a different payload is a conflict, not a new request
    const changed = await request(app())
      .post("/api/transfers/requests")
      .set(cashierAuthorization)
      .send({ ...body, notes: "ملاحظة مختلفة" });
    expect(changed.status).toBe(409);
    expect(await db.select().from(transferRequests)).toHaveLength(1);
  });
});
