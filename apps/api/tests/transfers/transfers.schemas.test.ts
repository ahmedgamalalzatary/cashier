import { describe, expect, it } from "vitest";
import {
  transferApprovalInput,
  transferDirectInput,
  transferRejectionInput,
  transferRequestInput,
} from "../../src/modules/transfers/transfers.schemas.js";

const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const validRequest = {
  clientRequestId: requestId,
  notes: "احتياج الوردية",
  lines: [{ itemId: 5, quantity: 2.5 }],
};

describe("transfer request schema", () => {
  it("accepts a valid request and blanks notes to null", () => {
    const parsed = transferRequestInput.parse({
      ...validRequest,
      notes: "   ",
    });

    expect(parsed.notes).toBeNull();
    expect(parsed.lines).toEqual([{ itemId: 5, quantity: 2.5 }]);
  });

  it("rejects a duplicate itemId in request, direct, and approval inputs", () => {
    const lines = [
      { itemId: 5, quantity: 1 },
      { itemId: 5, quantity: 2 },
    ];

    for (const schema of [
      transferRequestInput,
      transferDirectInput,
      transferApprovalInput,
    ]) {
      const input =
        schema === transferApprovalInput
          ? { lines }
          : schema === transferDirectInput
            ? { notes: null, lines }
            : { ...validRequest, lines };
      const result = schema.safeParse(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          "لا يمكن تكرار الصنف في التحويل",
        );
      }
    }
  });

  it("rejects non-positive and over-precise quantities", () => {
    for (const quantity of [0, -1, 1.0005]) {
      const result = transferRequestInput.safeParse({
        ...validRequest,
        lines: [{ itemId: 5, quantity }],
      });

      expect(result.success).toBe(false);
    }

    const ok = transferRequestInput.parse({
      ...validRequest,
      lines: [{ itemId: 5, quantity: 1.005 }],
    });
    expect(ok.lines[0]?.quantity).toBe(1.005);
  });

  it("rejects empty line lists and bad rejection reasons", () => {
    expect(
      transferRequestInput.safeParse({ ...validRequest, lines: [] }).success,
    ).toBe(false);
    expect(
      transferRejectionInput.safeParse({ reason: "   " }).success,
    ).toBe(false);
    expect(
      transferRejectionInput.safeParse({ reason: "x".repeat(501) }).success,
    ).toBe(false);
    expect(
      transferRejectionInput.safeParse({ reason: "تالف" }).success,
    ).toBe(true);
  });

  it("coerces string numbers from form payloads", () => {
    const parsed = transferRequestInput.parse({
      ...validRequest,
      lines: [{ itemId: "5", quantity: "2.5" }],
    });

    expect(parsed.lines).toEqual([{ itemId: 5, quantity: 2.5 }]);
  });
});
