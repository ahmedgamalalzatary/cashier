import { readSession, writeSession } from "./auth";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const session = readSession();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (res.status === 401 && path !== "/api/auth/login") writeSession(null);
    throw new Error(body?.error ?? "حدث خطأ غير متوقع");
  }
  return res.json();
}
