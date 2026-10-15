import { testId } from "@cashier/shared/test-support";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TransferDetail } from "@cashier/shared";
import { TransferDocument } from "../../../src/components/transfers/transfer-document";

const baseTransfer = {
  id: testId(1),
  createdBy: testId(2),
  createdByName: "أحمد",
  approvedBy: testId(3),
  approvedByName: "منى",
  notes: "نقل صباحي",
  totalCost: "120.00",
  isNegativeStock: false,
  createdAt: "2026-10-01T08:00:00.000Z",
  requestCreatedAt: null,
  requestReviewedAt: null,
  lines: [
    {
      id: testId(4),
      itemId: testId(5),
      itemCode: 12,
      itemName: "بن محمص",
      stockUnit: "جم",
      quantity: "1500.000",
      unitCost: "0.08",
      lineCost: "120.00",
      sourceBatchId: testId(6),
      cafeBatchId: testId(7),
    },
  ],
} satisfies Omit<TransferDetail, "requestId">;

const printable = (html: string) => {
  expect(html).toContain("a4-print-root");
  expect(html).not.toContain("receipt-print-root");
};

describe("transfer document (A4)", () => {
  it("prints a direct transfer with its route, people and signatures", () => {
    const transfer = {
      ...baseTransfer,
      requestId: null,
    } satisfies TransferDetail;

    const html = renderToStaticMarkup(<TransferDocument transfer={transfer} />);

    printable(html);
    expect(html).toContain("تحويل مخزني");
    expect(html).toContain("تحويل مباشر");
    expect(html).toContain("المخزن الرئيسي");
    expect(html).toContain("مخزن الكافيه");
    expect(html).toContain("أحمد");
    expect(html).toContain("منى");
    expect(html).toContain("بن محمص");
    expect(html).toContain("جم");
    expect(html).toContain("نقل صباحي");
    expect(html).toContain("المُسلِّم");
    expect(html).toContain("المُستلِم");
  });

  it("prints a request-approved transfer with its request number", () => {
    const transfer = {
      ...baseTransfer,
      requestId: testId(9),
      requestCreatedAt: "2026-09-30T06:00:00.000Z",
      requestReviewedAt: "2026-10-01T07:00:00.000Z",
    } satisfies TransferDetail;

    const html = renderToStaticMarkup(<TransferDocument transfer={transfer} />);

    printable(html);
    expect(html).toContain(`طلب تحويل #${testId(9)}`);
    expect(html).not.toContain("تحويل مباشر");
    // the original request and its approval are times of their own
    expect(html).toContain("وقت الطلب");
    expect(html).toContain("وقت الاعتماد");
  });

  it("prints only the execution time for a direct transfer", () => {
    const transfer = {
      ...baseTransfer,
      requestId: null,
    } satisfies TransferDetail;

    const html = renderToStaticMarkup(<TransferDocument transfer={transfer} />);

    printable(html);
    expect(html).toContain("وقت التنفيذ");
    expect(html).not.toContain("وقت الطلب");
    expect(html).not.toContain("وقت الاعتماد");
  });

  it("flags a transfer that took main stock below zero", () => {
    const transfer = {
      ...baseTransfer,
      requestId: null,
      isNegativeStock: true,
      lines: [{ ...baseTransfer.lines[0], sourceBatchId: null }],
    } satisfies TransferDetail;

    const html = renderToStaticMarkup(<TransferDocument transfer={transfer} />);

    printable(html);
    expect(html).toContain("رصيد سالب");
  });
});
