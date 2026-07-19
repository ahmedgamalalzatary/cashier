import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createLoginRateLimiter } from "./login-rate-limit.js";

function testApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.post(
    "/login",
    createLoginRateLimiter({
      maxUsernameAttempts: 2,
      maxIpAttempts: 10,
      windowMs: 60_000,
    }),
    (_req, res) => {
      res.status(401).json({ error: "invalid" });
    },
  );
  return app;
}

describe("login rate limiting", () => {
  it("blocks repeated attempts for the same IP and username", async () => {
    const app = testApp();
    const login = () =>
      request(app)
        .post("/login")
        .set("X-Forwarded-For", "203.0.113.8")
        .send({ username: "admin" });

    expect((await login()).status).toBe(401);
    expect((await login()).status).toBe(401);
    const blocked = await login();

    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("does not let failures from other IPs lock a username globally", async () => {
    const app = testApp();
    const attempt = (ip: string) =>
      request(app)
        .post("/login")
        .set("X-Forwarded-For", ip)
        .send({ username: "admin" });

    await attempt("203.0.113.10");
    await attempt("203.0.113.10");

    expect((await attempt("203.0.113.11")).status).toBe(401);
  });

  it("blocks one IP even when attempts rotate across usernames", async () => {
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    app.post(
      "/login",
      createLoginRateLimiter({
        maxUsernameAttempts: 10,
        maxIpAttempts: 2,
        windowMs: 60_000,
      }),
      (_req, res) => res.status(401).end(),
    );

    const attempt = (username: string) =>
      request(app)
        .post("/login")
        .set("X-Forwarded-For", "203.0.113.20")
        .send({ username });
    await attempt("first");
    await attempt("second");
    expect((await attempt("third")).status).toBe(429);
  });

  it("retains the shared IP attempts after a successful login", async () => {
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    app.post(
      "/login",
      createLoginRateLimiter({
        maxUsernameAttempts: 10,
        maxIpAttempts: 2,
        windowMs: 60_000,
      }),
      (req, res) =>
        res.status(req.body.password === "correct" ? 200 : 401).end(),
    );
    const attempt = (username: string, password: string) =>
      request(app)
        .post("/login")
        .set("X-Forwarded-For", "203.0.113.30")
        .send({ username, password });

    expect((await attempt("admin", "correct")).status).toBe(200);
    expect((await attempt("other", "wrong")).status).toBe(401);
    expect((await attempt("third", "wrong")).status).toBe(429);
  });

  it("does not evict an active block when the tracked-key limit is reached", async () => {
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    app.post(
      "/login",
      createLoginRateLimiter({
        maxUsernameAttempts: 1,
        maxIpAttempts: 100,
        maxTrackedKeys: 1,
        windowMs: 60_000,
      }),
      (_req, res) => res.status(401).end(),
    );
    const attempt = (username: string) =>
      request(app)
        .post("/login")
        .set("X-Forwarded-For", "203.0.113.40")
        .send({ username });

    expect((await attempt("admin")).status).toBe(401);
    expect((await attempt("noise")).status).toBe(429);
    expect((await attempt("admin")).status).toBe(429);
  });
});
