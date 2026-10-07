"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Coffee,
  Building2,
  LayoutDashboard,
  Warehouse,
  ArrowLeftRight,
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
  UserCog,
  ShoppingCart,
  ShoppingBag,
  ReceiptText,
  ClipboardCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@cashier/web-core/components/auth/auth-provider";
import { NAV_GROUPS, NAV_ITEMS } from "@cashier/web-core/lib/navigation";
import { normalizePath } from "@cashier/web-core/lib/auth";

type NavHref = (typeof NAV_ITEMS)[number]["href"];

const navIcons: Record<NavHref, LucideIcon> = {
  "/": LayoutDashboard,
  "/pos": ShoppingBag,
  "/orders": ReceiptText,
  "/inventory": Warehouse,
  "/transfers": ArrowLeftRight,
  "/stocktakes": ClipboardCheck,
  "/categories": Tags,
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
  "/branches": Building2,
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
  const pathname = normalizePath(usePathname());
  const { user, logout } = useAuth();
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
        className={`app-drawer fixed inset-y-0 start-0 z-40 w-64 max-w-[85vw] flex-col overflow-y-auto bg-sidebar text-sidebar-ink lg:sticky lg:top-0 lg:z-auto lg:flex lg:h-screen lg:w-56 lg:max-w-none lg:shrink-0 ${
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
        <nav className="flex-1 space-y-5 px-3 pb-6 pt-1">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter(
              (item) =>
                !("adminOnly" in item && item.adminOnly) ||
                user?.role === "admin",
            );
            if (items.length === 0) return null;
            return (
              <div key={group.label}>
                <p className="mb-1 px-3 text-[11px] font-semibold tracking-wide text-sidebar-ink/70">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {items.map(({ href, label }) => {
                    const Icon = navIcons[href];
                    const active =
                      href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(href);
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
                </div>
              </div>
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
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-white/5 hover:text-white"
          >
            <LogOut className="size-4.5" />
            تسجيل الخروج
          </button>
        </div>
      </aside>
    </>
  );
}
