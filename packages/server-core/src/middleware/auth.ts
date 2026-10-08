import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { and, eq } from "drizzle-orm";
import type { Db } from "@cashier/db";
import { adminBranches, branches, users } from "@cashier/db";
import { HttpError } from "./error.js";
import { resolveAccess, type Access } from "../access.js";
import type { AuthUser } from "@cashier/shared";
import { toAuthUser } from "../modules/auth/auth-user.js";
import { idParam } from "./validation.js";

declare global {
  // Express request fields are extended globally by the framework's type definitions.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

type AuthToken = AuthUser & { tokenVersion: number };

export const AUTH_COOKIE_NAME = "cashier.token";
const AUTH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function signToken(
  user: AuthUser,
  tokenVersion: number,
  jwtSecret: string,
) {
  return jwt.sign({ ...user, tokenVersion }, jwtSecret, { expiresIn: "30d" });
}

function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  const entry = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!entry) return undefined;
  try {
    return decodeURIComponent(entry.slice(name.length + 1));
  } catch {
    return undefined;
  }
}

function authCookieOptions(req: Request) {
  return {
    httpOnly: true,
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
    sameSite: "lax" as const,
    // localhost dev stays http; TLS-terminating deployments (trust proxy)
    // automatically upgrade the cookie to Secure.
    secure: req.secure,
  };
}

export function setAuthCookie(req: Request, res: Response, token: string) {
  res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions(req));
}

export function clearAuthCookie(req: Request, res: Response) {
  res.clearCookie(AUTH_COOKIE_NAME, { ...authCookieOptions(req), maxAge: 0 });
}

export function readRequestToken(req: Request) {
  const fromCookie = readCookie(req.headers.cookie, AUTH_COOKIE_NAME);
  if (fromCookie) return fromCookie;
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}

export function authenticate(db: Db, jwtSecret: string, access?: Access) {
  const { branchId, online } = resolveAccess(access);
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = readRequestToken(req);
    if (!token) throw new HttpError(401, "يجب تسجيل الدخول");

    let payload: AuthToken;
    try {
      payload = jwt.verify(token, jwtSecret) as AuthToken;
      if (!idParam.safeParse(payload.id).success)
        throw new Error("Invalid session ID");
    } catch {
      throw new HttpError(401, "انتهت الجلسة — سجّل الدخول من جديد");
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.id))
      .limit(1);
    if (!user?.isActive || payload.tokenVersion !== user.tokenVersion)
      throw new HttpError(401, "انتهت الجلسة — سجّل الدخول من جديد");
    if (online && user.role === "cashier")
      throw new HttpError(401, "لا يملك الكاشير صلاحية الدخول عبر الإنترنت");
    if (branchId) {
      if (user.role === "cashier" && user.branchId !== branchId)
        throw new HttpError(403, "هذا الحساب غير معيّن لهذا الفرع");
      if (user.role === "cashier") {
        const [branch] = await db
          .select()
          .from(branches)
          .where(eq(branches.id, branchId))
          .limit(1);
        if (!branch?.isActive)
          throw new HttpError(403, "الفرع مؤرشف؛ لا يمكن تسجيل الدخول");
      }
      if (user.role === "admin" && !user.isSuperAdmin) {
        const [assignment] = await db
          .select()
          .from(adminBranches)
          .where(
            and(
              eq(adminBranches.adminUserId, user.id),
              eq(adminBranches.branchId, branchId),
            ),
          )
          .limit(1);
        if (!assignment)
          throw new HttpError(403, "هذا الحساب غير معيّن لهذا الفرع");
      }
    }
    req.user = toAuthUser(user);
    next();
  };
}

export function requireRole(role: AuthUser["role"]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new HttpError(401, "يجب تسجيل الدخول");
    if (req.user.role !== role)
      throw new HttpError(403, "لا تملك صلاحية الوصول");
    next();
  };
}

/**
 * Online management is the super-admin's alone (plan Phase 8): an ordinary
 * admin reads branches but never creates, renames, or archives one.
 */
export function requireSuperAdmin() {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new HttpError(401, "يجب تسجيل الدخول");
    if (!req.user.isSuperAdmin)
      throw new HttpError(403, "هذا الإجراء متاح للمدير العام فقط");
    next();
  };
}
