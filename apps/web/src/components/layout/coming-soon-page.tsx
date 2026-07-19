import Link from "next/link";
import { ArrowRight, Construction } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { unfinishedModules, type UnfinishedModule } from "./unfinished-modules";

export function ComingSoonPage({ module }: { module: UnfinishedModule }) {
  const details = unfinishedModules[module];

  return (
    <section className="mx-auto max-w-4xl">
      <PageHeader title={details.title} />
      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_18px_55px_rgb(43_33_24/0.08)]">
        <div className="absolute inset-y-0 right-0 w-2 bg-[repeating-linear-gradient(180deg,var(--accent)_0,var(--accent)_10px,transparent_10px,transparent_17px)]" />
        <div className="grid min-h-80 gap-8 p-8 sm:grid-cols-[1fr_auto] sm:items-center sm:p-12">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/35 bg-accent/10 px-3 py-1 text-sm font-medium text-primary-strong">
              <Construction className="size-4" aria-hidden="true" />
              قيد التجهيز
            </div>
            <h2 className="max-w-xl text-3xl font-bold leading-tight sm:text-4xl">
              هذا القسم لم يفتح أبوابه بعد
            </h2>
            <p className="mt-4 max-w-xl leading-8 text-muted">
              {details.description}
            </p>
            <Link
              href="/"
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <ArrowRight className="size-4" aria-hidden="true" />
              العودة إلى الرئيسية
            </Link>
          </div>
          <div
            className="select-none border-t border-dashed border-line pt-6 text-left sm:border-r sm:border-t-0 sm:pr-8 sm:pt-0"
            aria-hidden="true"
          >
            <div className="text-xs font-medium tracking-[0.28em] text-muted">
              MODULE
            </div>
            <div className="tnum mt-1 text-6xl font-bold text-line sm:text-7xl">
              {details.code}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
