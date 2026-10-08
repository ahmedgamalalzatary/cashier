"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@cashier/web-core/components/ui/button";
import { useAuth } from "@cashier/web-core/components/auth/auth-provider";
import { BranchPicker } from "./branch-picker";

export function OnlineShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  // The sign-in page has no session, so it takes the whole screen.
  if (!user) return <>{children}</>;
  return (
    <div className="min-h-full">
      <header className="print:hidden border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <Link
            href="/reports"
            className="text-base font-bold text-primary hover:underline"
          >
            تقارير الكاشير
          </Link>
          <BranchPicker />
          {user.isSuperAdmin && (
            <Link href="/branches" className="text-sm text-primary hover:underline">
              إدارة الفروع
            </Link>
          )}
          <Button onClick={() => void logout()}>تسجيل الخروج</Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-5 py-6">{children}</main>
    </div>
  );
}