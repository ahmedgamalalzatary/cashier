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
  { href: "/pos", label: "نقطة البيع", hint: "افتح طلباً جديداً", icon: ShoppingBag },
  { href: "/refunds", label: "المرتجع", hint: "أرجع صنفاً من طلب", icon: RotateCcw },
  { href: "/expenses", label: "مصروفات الدرج", hint: "اصرف من النقدية", icon: Receipt },
  { href: "/waste", label: "الهالك", hint: "سجّل تالفاً أو مسكوباً", icon: Trash2 },
  { href: "/cafe", label: "مخزن الكافيه", hint: "اطلب تحويلاً من المخزن", icon: CupSoda },
  { href: "/shifts", label: "الورديات", hint: "افتح أو أغلق وردية", icon: Clock },
];

const adminActions: Action[] = [
  { href: "/purchases", label: "المشتريات", hint: "سجّل فاتورة مورد", icon: ShoppingCart },
  { href: "/cafe", label: "مخزن الكافيه", hint: "راجع طلبات التحويل", icon: CupSoda },
  { href: "/warehouse", label: "المخزن الرئيسي", hint: "الأصناف والأرصدة", icon: Warehouse },
  { href: "/suppliers", label: "الموردين", hint: "الأرصدة والمدفوعات", icon: Truck },
  { href: "/recipes", label: "الوصفات", hint: "التكلفة وهامش الربح", icon: BookOpen },
  { href: "/shifts", label: "الورديات", hint: "متابعة الكاشير والدرج", icon: Clock },
];

export function QuickActions({ role }: { role: Role }) {
  const actions = role === "admin" ? adminActions : cashierActions;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {actions.map((action, index) => (
        <li key={action.href}>
          <ActionTile action={action} lead={index === 0} />
        </li>
      ))}
    </ul>
  );
}

function ActionTile({ action, lead }: { action: Action; lead: boolean }) {
  const Icon = action.icon;
  return (
    <Link
      href={action.href}
      className={`flex h-full items-start gap-3 rounded-xl border p-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        lead
          ? "border-transparent bg-primary text-white hover:bg-primary-strong"
          : "border-line bg-surface hover:border-primary/35 hover:bg-primary/5"
      }`}
    >
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-lg ${
          lead ? "bg-white/15 text-white" : "bg-primary/10 text-primary"
        }`}
      >
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{action.label}</span>
        <span
          className={`mt-0.5 block text-xs ${lead ? "text-white/75" : "text-muted"}`}
        >
          {action.hint}
        </span>
      </span>
    </Link>
  );
}
