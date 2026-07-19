import { readSession, writeSession } from "./auth";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function buildHeaders(input: HeadersInit | undefined, token?: string) {
  const headers = new Headers(input);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const session = readSession();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: buildHeaders(init?.headers, session?.token),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (res.status === 401 && path !== "/api/auth/login") writeSession(null);
    throw new Error(body?.error ?? "حدث خطأ غير متوقع");
  }
  return res.json();
}
