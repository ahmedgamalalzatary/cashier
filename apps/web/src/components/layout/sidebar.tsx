"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Coffee,
  LayoutDashboard,
  Warehouse,
  CupSoda,
  Truck,
  Clock,
  Users,
  Wallet,
  Receipt,
  Trash2,
  RotateCcw,
  BookOpen,
  BarChart3,
  Tags,
  LogOut,
  KeyRound,
  UserCog,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { NAV_ITEMS } from "@/lib/navigation";
import { ChangePasswordModal } from "@/components/auth/change-password-modal";

type NavHref = (typeof NAV_ITEMS)[number]["href"];

const navIcons: Record<NavHref, LucideIcon> = {
  "/": LayoutDashboard,
  "/categories": Tags,
  "/warehouse": Warehouse,
  "/cafe": CupSoda,
  "/suppliers": Truck,
  "/purchases": ShoppingCart,
  "/users": UserCog,
  "/shifts": Clock,
  "/employees": Users,
  "/salaries": Wallet,
  "/expenses": Receipt,
  "/waste": Trash2,
  "/refunds": RotateCcw,
  "/recipes": BookOpen,
  "/reports": BarChart3,
};

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const visibleNav = NAV_ITEMS.filter(
    (item) =>
      !("adminOnly" in item && item.adminOnly) || user?.role === "admin",
  );
  return (
    <aside className="w-56 shrink-0 bg-sidebar text-sidebar-ink flex flex-col">
      <div className="flex items-center gap-2 px-5 py-5 text-accent">
        <Coffee className="size-6" />
        <span className="text-lg font-bold text-white">الكافيه</span>
      </div>
      <nav className="flex-1 px-3 pb-6 space-y-0.5">
        {visibleNav.map(({ href, label }) => {
          const Icon = navIcons[href];
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-white/10 text-white border-e-2 border-accent"
                  : "hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="size-4.5" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="mb-2 px-3 text-xs text-sidebar-ink">
          <div className="truncate font-medium text-white">{user?.name}</div>
          <div>{user?.role === "admin" ? "مدير النظام" : "كاشير"}</div>
        </div>
        <button
          type="button"
          onClick={() => setPasswordOpen(true)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-white/5 hover:text-white"
        >
          <KeyRound className="size-4.5" />
          تغيير كلمة المرور
        </button>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-white/5 hover:text-white"
        >
          <LogOut className="size-4.5" />
          تسجيل الخروج
        </button>
      </div>
      {passwordOpen && (
        <ChangePasswordModal onClose={() => setPasswordOpen(false)} />
      )}
    </aside>
  );
}
