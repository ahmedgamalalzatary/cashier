import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/lib/api";
import {
  adminCloseShift,
  closeShift,
  correctShift,
  getCurrentShift,
  listShifts,
  openShift,
  reopenShift,
} from "../../src/services/shifts-service";

vi.mock("../../src/lib/api", () => ({ api: vi.fn() }));
const request = vi.mocked(api);

describe("shifts service", () => {
  beforeEach(() => request.mockReset().mockResolvedValue(undefined as never));

  it("uses every shift lifecycle endpoint", async () => {
    await listShifts();
    await getCurrentShift();
    await openShift(100);
    await closeShift(2, 350);
    await adminCloseShift(2, { actualCash: 350, note: "إغلاق إداري" });
    await reopenShift(2, "إعادة فتح");
    await correctShift(2, {
      openingFloat: 110,
      actualCash: 360,
      note: "تصحيح",
    });

    expect(request.mock.calls).toEqual([
      ["/api/shifts"],
      ["/api/shifts/current"],
      [
        "/api/shifts/open",
        { method: "POST", body: JSON.stringify({ openingFloat: 100 }) },
      ],
      [
        "/api/shifts/2/close",
        { method: "POST", body: JSON.stringify({ actualCash: 350 }) },
      ],
      [
        "/api/shifts/2/admin-close",
        {
          method: "POST",
          body: JSON.stringify({ actualCash: 350, note: "إغلاق إداري" }),
        },
      ],
      [
        "/api/shifts/2/reopen",
        { method: "POST", body: JSON.stringify({ note: "إعادة فتح" }) },
      ],
      [
        "/api/shifts/2/correction",
        {
          method: "PUT",
          body: JSON.stringify({
            openingFloat: 110,
            actualCash: 360,
            note: "تصحيح",
          }),
        },
      ],
    ]);
  });
});
