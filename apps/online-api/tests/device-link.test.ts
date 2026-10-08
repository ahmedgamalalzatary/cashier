import type { Db } from "@cashier/db";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const options = {
  jwtSecret: "test-only-jwt-secret-at-least-32-characters",
  corsOrigins: ["https://cashier.biscofa.tech"],
  trustProxy: true,
};

// A malformed code is refused before the database is touched.
const untouchedDb = {} as Db;

describe("device link endpoint", () => {
  it("answers a PC that has no admin session", async () => {
    const response = await request(createApp(untouchedDb, options))
      .post("/api/device/link")
      .send({ code: "nope" });

    expect(response.status).toBe(400);
  });

  it("rejects a request without a code", async () => {
    const response = await request(createApp(untouchedDb, options))
      .post("/api/device/link")
      .send({});

    expect(response.status).toBe(400);
  });

  it("stops one address after five wrong codes", async () => {
    const app = createApp(untouchedDb, options);
    const attempt = () =>
      request(app)
        .post("/api/device/link")
        .set("X-Forwarded-For", "203.0.113.7")
        .send({ code: "nope" });

    for (let index = 0; index < 5; index += 1)
      expect((await attempt()).status).toBe(400);
    const blocked = await attempt();
    const otherAddress = await request(app)
      .post("/api/device/link")
      .set("X-Forwarded-For", "203.0.113.8")
      .send({ code: "nope" });

    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
    expect(otherAddress.status).toBe(400);
  });
});
