"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";

const nav = [
  { href: "/", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/categories", label: "التصنيفات", icon: Tags },
  { href: "/warehouse", label: "المخزن الرئيسي", icon: Warehouse },
  { href: "/cafe", label: "الكافيه", icon: CupSoda },
  { href: "/suppliers", label: "الموردين", icon: Truck },
  { href: "/shifts", label: "الورديات", icon: Clock },
  { href: "/employees", label: "الموظفين", icon: Users },
  { href: "/salaries", label: "المرتبات", icon: Wallet },
  { href: "/expenses", label: "المصروفات", icon: Receipt },
  { href: "/waste", label: "الهالك", icon: Trash2 },
  { href: "/refunds", label: "المرتجع", icon: RotateCcw },
  { href: "/recipes", label: "الوصفات", icon: BookOpen },
  { href: "/reports", label: "التقارير", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 shrink-0 bg-sidebar text-sidebar-ink flex flex-col">
      <div className="flex items-center gap-2 px-5 py-5 text-accent">
        <Coffee className="size-6" />
        <span className="text-lg font-bold text-white">الكافيه</span>
      </div>
      <nav className="flex-1 px-3 pb-6 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
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
    </aside>
  );
}
