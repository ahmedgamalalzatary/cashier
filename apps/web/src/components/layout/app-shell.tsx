"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Coffee, Menu } from "lucide-react";
import { normalizePath } from "@/lib/auth";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = normalizePath(usePathname());
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("overflow-hidden", "lg:overflow-auto");
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("overflow-hidden", "lg:overflow-auto");
    };
  }, [navOpen]);

  if (pathname === "/login") return <main className="min-h-screen">{children}</main>;

  return (
    <div className="min-h-screen lg:flex">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        <span className="flex items-center gap-2 text-primary">
          <Coffee className="size-5" />
          <span className="font-bold text-ink">الكافيه</span>
        </span>
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          aria-label="فتح القائمة"
          aria-expanded={navOpen}
          aria-controls="app-nav"
          className="-me-2 rounded-lg p-2 text-muted hover:bg-line/50 hover:text-ink"
        >
          <Menu className="size-5" />
        </button>
      </header>
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
