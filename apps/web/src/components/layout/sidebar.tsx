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
  ShoppingBag,
  ReceiptText,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { NAV_ITEMS } from "@/lib/navigation";
import { ChangePasswordModal } from "@/components/auth/change-password-modal";

type NavHref = (typeof NAV_ITEMS)[number]["href"];

const navIcons: Record<NavHref, LucideIcon> = {
  "/": LayoutDashboard,
  "/pos": ShoppingBag,
  "/orders": ReceiptText,
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

/**
 * A column on desktop, a drawer below `lg`. The shell owns `open` so the
 * header button and the nav stay in sync.
 */
export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const visibleNav = NAV_ITEMS.filter(
    (item) =>
      !("adminOnly" in item && item.adminOnly) || user?.role === "admin",
  );
  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="إغلاق القائمة"
          onClick={onClose}
          className="app-scrim fixed inset-0 z-30 bg-ink/50 lg:hidden"
        />
      )}
      <aside
        id="app-nav"
        className={`app-drawer fixed inset-y-0 start-0 z-40 w-64 max-w-[85vw] flex-col overflow-y-auto bg-sidebar text-sidebar-ink lg:static lg:z-auto lg:flex lg:w-56 lg:max-w-none lg:shrink-0 ${
          open ? "flex" : "hidden"
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-5 py-5 text-accent">
          <span className="flex items-center gap-2">
            <Coffee className="size-6" />
            <span className="text-lg font-bold text-white">الكافيه</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق القائمة"
            className="-me-2 rounded-lg p-2 text-sidebar-ink hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 pb-6">
          {visibleNav.map(({ href, label }) => {
            const Icon = navIcons[href];
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
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
      </aside>
      {passwordOpen && (
        <ChangePasswordModal onClose={() => setPasswordOpen(false)} />
      )}
    </>
  );
}
