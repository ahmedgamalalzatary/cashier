import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * One bordered panel with an optional ruled header. Panels are never nested;
 * a page composes flat sections instead of a card pile.
 */
export function Section({
  title,
  description,
  icon,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("sheet overflow-hidden", className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {icon && <span className="shrink-0 text-primary">{icon}</span>}
            <div className="min-w-0">
              {title && <h2 className="font-bold">{title}</h2>}
              {description && (
                <p className="mt-0.5 text-xs text-muted">{description}</p>
              )}
            </div>
          </div>
          {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
