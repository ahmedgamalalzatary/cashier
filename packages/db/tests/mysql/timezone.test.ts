import { it, testBranchValues } from "../support/ids.js";
import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { transferRequests, users } from "../../src/schema.js";
import { db } from "../support/database.js";

describe("database session timezone", () => {
  it("runs every pooled connection in UTC", async () => {
    const [rows] = await db.$client.query<Array<RowDataPacket & { tz: string }>>(
      "SELECT @@session.time_zone AS tz",
    );
    expect(rows[0].tz).toBe("+00:00");
  });

  it("stores defaultNow timestamps in UTC, not the server's local time", async () => {
    const [user] = await db.insert(users).values(testBranchValues({
      name: "مدير المنطقة الزمنية",
      username: "timezone-admin",
      passwordHash: "x",
      role: "admin",
    })).$returningId();
    await db.insert(transferRequests).values(testBranchValues({
      requestedBy: user.id,
      clientRequestId: randomUUID(),
      requestFingerprint: "f".repeat(64),
    }));

    const [row] = await db
      .select({ createdAt: transferRequests.createdAt })
      .from(transferRequests)
      .where(eq(transferRequests.requestedBy, user.id));

    expect(Math.abs(row.createdAt.getTime() - Date.now())).toBeLessThan(60_000);
  });
});
