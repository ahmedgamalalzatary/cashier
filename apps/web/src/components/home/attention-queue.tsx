"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { AttentionItem, AttentionTone } from "@/models/home-model";

const dots: Record<AttentionTone, string> = {
  danger: "bg-danger",
  warn: "bg-accent",
  info: "bg-muted",
};

export function AttentionQueue({ items }: { items: AttentionItem[] }) {
  if (items.length === 0)
    return (
      <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-center text-sm text-muted">
        لا شيء ينتظر إجراء. المخزون فوق حدود التنبيه ولا توجد طلبات معلّقة.
      </p>
    );

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={item.href}
            className="flex items-center gap-3 px-4 py-3.5 text-sm transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          >
            <span
              className={`size-2 shrink-0 rounded-full ${dots[item.tone]}`}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">{item.label}</span>
            <ChevronLeft className="size-4 shrink-0 text-muted" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
