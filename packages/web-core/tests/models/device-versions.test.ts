import type { DeviceStatus } from "@cashier/shared";
import { testId } from "@cashier/shared/test-support";
import { describe, expect, it } from "vitest";
import { versionsInUse } from "../../src/models/device-versions";

const pc = (n: number, appVersion: string | null): DeviceStatus => ({
  branchId: testId(n),
  appVersion,
  linkedAt: "2026-10-01T10:00:00.000Z",
  lastSeenAt: appVersion ? "2026-10-10T10:00:00.000Z" : null,
  lastUploadAt: null,
});

describe("desktop versions in use", () => {
  it("counts branches per version, newest version first and unreported last", () => {
    expect(
      versionsInUse([
        pc(1, "0.2.4"),
        pc(2, "0.2.10"),
        pc(3, null),
        pc(4, "0.2.4"),
        pc(5, "0.3.0"),
      ]),
    ).toEqual([
      { version: "0.3.0", branches: 1 },
      { version: "0.2.10", branches: 1 },
      { version: "0.2.4", branches: 2 },
      { version: null, branches: 1 },
    ]);
  });

  it("is empty when no PC is linked yet", () => {
    expect(versionsInUse([])).toEqual([]);
  });
});
