"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  canOpenPath,
  readSession,
  subscribeToSessionChanges,
  writeSession,
  type AuthUser,
  type Session,
} from "@/lib/auth";

type AuthContextValue = {
  user: AuthUser | null;
  login(username: string, password: string): Promise<void>;
  logout(): void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const sync = () => setSession(readSession());
    sync();
    return subscribeToSessionChanges(sync);
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session && pathname !== "/login") router.replace("/login");
    else if (session && pathname === "/login") router.replace("/");
    else if (session && !canOpenPath(session.user.role, pathname)) router.replace("/");
  }, [pathname, router, session]);

  async function login(username: string, password: string) {
    const next = await api<Session>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    writeSession(next);
    setSession(next);
    router.replace("/");
  }

  function logout() {
    writeSession(null);
    setSession(null);
    router.replace("/login");
  }

  const blocked =
    session === undefined ||
    (!session && pathname !== "/login") ||
    (!!session && (pathname === "/login" || !canOpenPath(session.user.role, pathname)));

  if (blocked) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper" role="status" aria-label="جاري التحميل">
        <span className="size-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  return <AuthContext.Provider value={{ user: session?.user ?? null, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
