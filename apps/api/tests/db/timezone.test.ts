import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { transferRequests, users } from "../../src/db/schema.js";
import { db } from "../setup.js";

describe("database session timezone", () => {
  it("runs every pooled connection in UTC", async () => {
    const [rows] = await db.$client.query<Array<RowDataPacket & { tz: string }>>(
      "SELECT @@session.time_zone AS tz",
    );
    expect(rows[0].tz).toBe("+00:00");
  });

  it("stores defaultNow timestamps in UTC, not the server's local time", async () => {
    const [user] = await db.insert(users).values({
      name: "مدير المنطقة الزمنية",
      username: "timezone-admin",
      passwordHash: "x",
      role: "admin",
    });
    await db.insert(transferRequests).values({
      requestedBy: user.insertId,
      clientRequestId: randomUUID(),
      requestFingerprint: "f".repeat(64),
    });

    const [row] = await db
      .select({ createdAt: transferRequests.createdAt })
      .from(transferRequests)
      .where(eq(transferRequests.requestedBy, user.insertId));

    expect(Math.abs(row.createdAt.getTime() - Date.now())).toBeLessThan(60_000);
  });
});
