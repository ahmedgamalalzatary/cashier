import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function StatStrip({
  children,
  tone = "light",
  className,
  min,
}: {
  children: ReactNode;
  tone?: "light" | "dark";
  className?: string;
  min?: string;
}) {
  return (
    <section
      className={cn("statline", className)}
      data-tone={tone === "dark" ? "dark" : undefined}
      style={min ? ({ "--stat-min": min } as CSSProperties) : undefined}
    >
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  icon,
  tone = "default",
  hint,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "danger";
  hint?: string;
}) {
  return (
    <div className="stat">
      <div className="flex items-center gap-2">
        {icon && (
          <span
            className={cn(
              "shrink-0",
              tone === "danger" ? "text-danger" : "text-primary",
            )}
          >
            {icon}
          </span>
        )}
        <p className="min-w-0 text-xs text-muted">{label}</p>
      </div>
      <p
        className={cn(
          "tnum mt-1 truncate text-xl font-bold",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
