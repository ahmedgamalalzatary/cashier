import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "../../src/db/index.js";
import { errorHandler } from "../../src/middleware/error.js";
import type { AuthController } from "../../src/modules/auth/auth.controller.js";
import { AuthController as RealAuthController } from "../../src/modules/auth/auth.controller.js";
import type { AuthService } from "../../src/modules/auth/auth.service.js";
import { authRouter } from "../../src/modules/auth/auth.router.js";

const JWT_SECRET = "test-only-jwt-secret-at-least-32-characters";

function appWithStubs(controller: AuthController) {
  const app = express();
  app.use(express.json());
  app.use(authRouter(controller, {} as Db, JWT_SECRET));
  app.use(errorHandler);
  return app;
}

describe("auth routes", () => {
  it("logs in with cookies and logs out cleanly", async () => {
    const session = { token: "tok", user: { id: 1 } };
    const service = {
      login: vi.fn(async () => session),
    } as unknown as AuthService;
    const app = appWithStubs(new RealAuthController(service));

    const loggedIn = await request(app).post("/login").send({
      username: "cashier",
      password: "secret123",
    });
    expect(loggedIn.status).toBe(200);
    expect(loggedIn.body).toEqual(session);
    expect(service.login).toHaveBeenCalledWith({
      username: "cashier",
      password: "secret123",
    });
    expect(loggedIn.headers["set-cookie"]?.join(";")).toContain("tok");

    const loggedOut = await request(app).post("/logout");
    expect(loggedOut.status).toBe(200);
    expect(loggedOut.body).toEqual({ ok: true });
  });

  it("rejects malformed login bodies and unauthenticated password changes", async () => {
    const service = {
      login: vi.fn(),
      changePassword: vi.fn(),
    } as unknown as AuthService;
    const app = appWithStubs(new RealAuthController(service));

    const badBody = await request(app).post("/login").send({
      username: "   ",
      password: "secret123",
    });
    expect(badBody.status).toBe(400);
    expect(service.login).not.toHaveBeenCalled();

    const anonymous = await request(app).put("/password").send({
      currentPassword: "old",
      newPassword: "new-secret-123",
    });
    expect(anonymous.status).toBe(401);
    expect(service.changePassword).not.toHaveBeenCalled();
  });
});
