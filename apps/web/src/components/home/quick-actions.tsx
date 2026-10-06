"use client";

import Link from "next/link";
import {
  BookOpen,
  CupSoda,
  Clock,
  Receipt,
  RotateCcw,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  Truck,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@cashier/shared";

type Action = {
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
};

/** Ordered by how often the job actually comes up, not by the sidebar order. */
const cashierActions: Action[] = [
  {
    href: "/pos",
    label: "نقطة البيع",
    hint: "افتح طلباً جديداً",
    icon: ShoppingBag,
  },
  {
    href: "/refunds",
    label: "المرتجع",
    hint: "أرجع صنفاً من طلب",
    icon: RotateCcw,
  },
  {
    href: "/expenses",
    label: "مصروفات الدرج",
    hint: "اصرف من النقدية",
    icon: Receipt,
  },
  {
    href: "/waste",
    label: "الهالك",
    hint: "سجّل تالفاً أو مسكوباً",
    icon: Trash2,
  },
  {
    href: "/transfers?new=request",
    label: "طلب تحويل",
    hint: "اطلب من المخزن الرئيسي",
    icon: CupSoda,
  },
];

const adminActions: Action[] = [
  {
    href: "/purchases/new",
    label: "فاتورة شراء",
    hint: "سجّل مورداً وصنفاً واستلاماً",
    icon: ShoppingCart,
  },
  {
    href: "/transfers",
    label: "طلبات التحويل",
    hint: "راجع واعتمد طلبات الكافيه",
    icon: CupSoda,
  },
  {
    href: "/inventory",
    label: "المخزون",
    hint: "الأرصدة والأصناف",
    icon: Warehouse,
  },
  {
    href: "/suppliers",
    label: "الموردين",
    hint: "الأرصدة والمدفوعات",
    icon: Truck,
  },
  {
    href: "/recipes",
    label: "الوصفات",
    hint: "التكلفة وهامش الربح",
    icon: BookOpen,
  },
  {
    href: "/shifts",
    label: "الورديات",
    hint: "متابعة الكاشير والدرج",
    icon: Clock,
  },
];

export function QuickActions({ role }: { role: Role }) {
  // POS is what a cashier opens dozens of times a day, so it leads as the
  // highlighted action; the admin board keeps every row equal.
  const actions = role === "admin" ? adminActions : cashierActions;
  return (
    <ul className="ledger">
      {actions.map((action, index) => (
        <ActionRow
          key={action.href}
          action={action}
          featured={role !== "admin" && index === 0}
        />
      ))}
    </ul>
  );
}

function ActionRow({ action, featured }: { action: Action; featured: boolean }) {
  const Icon = action.icon;
  return (
    <li>
      <Link
        href={action.href}
        className={
          featured
            ? "group flex h-full items-center gap-3 bg-primary px-4 py-3 text-white transition-colors hover:bg-primary-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
            : "group flex h-full items-center gap-3 px-4 py-3 transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        }
      >
        <span
          className={
            featured
              ? "grid size-9 shrink-0 place-items-center rounded-lg bg-white/15 text-white"
              : "grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
          }
        >
          <Icon className="size-4.5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">{action.label}</span>
          <span
            className={
              featured
                ? "mt-0.5 block text-xs text-white/75"
                : "mt-0.5 block text-xs text-muted"
            }
          >
            {action.hint}
          </span>
        </span>
      </Link>
    </li>
  );
}
