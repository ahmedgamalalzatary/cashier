import type { NextFunction, Request, Response } from "express";

type Options = {
  maxUsernameAttempts?: number;
  maxIpAttempts?: number;
  windowMs?: number;
  maxTrackedKeys?: number;
  now?: () => number;
  identity?: (req: Request) => string;
};

type Attempt = { count: number; resetAt: number };

export function createLoginRateLimiter({
  maxUsernameAttempts = 5,
  maxIpAttempts = 20,
  windowMs = 15 * 60_000,
  maxTrackedKeys = 10_000,
  now = Date.now,
  identity,
}: Options = {}) {
  const usernames = new Map<string, Attempt>();
  const clientIps = new Map<string, Attempt>();

  const consume = (
    buckets: Map<string, Attempt>,
    key: string,
    limit: number,
    timestamp: number,
  ) => {
    const previous = buckets.get(key);
    const current =
      !previous || previous.resetAt <= timestamp
        ? { count: 0, resetAt: timestamp + windowMs }
        : previous;

    if (current.count >= limit) return current;

    if (!previous && buckets.size >= maxTrackedKeys) {
      for (const [trackedKey, attempt] of buckets) {
        if (attempt.resetAt <= timestamp) buckets.delete(trackedKey);
      }
      if (buckets.size >= maxTrackedKeys) {
        const earliestReset = Math.min(
          ...Array.from(buckets.values(), (attempt) => attempt.resetAt),
        );
        return { count: limit, resetAt: earliestReset };
      }
    }
    current.count += 1;
    buckets.set(key, current);
    return undefined;
  };

  return (req: Request, res: Response, next: NextFunction) => {
    const username = identity
      ? identity(req)
      : typeof req.body?.username === "string"
        ? req.body.username.trim().toLowerCase()
        : "<invalid>";
    const ip = req.ip ?? "<unknown>";
    const usernameAndIp = `${username}\u0000${ip}`;
    const timestamp = now();
    const blocked = [
      consume(usernames, usernameAndIp, maxUsernameAttempts, timestamp),
      consume(clientIps, ip, maxIpAttempts, timestamp),
    ].filter((attempt): attempt is Attempt => Boolean(attempt));

    if (blocked.length > 0) {
      const resetAt = Math.max(...blocked.map((attempt) => attempt.resetAt));
      res.setHeader(
        "Retry-After",
        Math.max(1, Math.ceil((resetAt - timestamp) / 1000)),
      );
      res
        .status(429)
        .json({ error: "محاولات دخول كثيرة. حاول مرة أخرى لاحقاً" });
      return;
    }

    res.once("finish", () => {
      if (res.statusCode < 400) {
        usernames.delete(usernameAndIp);
      }
    });
    next();
  };
}
