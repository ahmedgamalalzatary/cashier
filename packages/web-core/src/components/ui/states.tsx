import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("empty-state", className)}>
      {icon && <div className="mx-auto mb-3 w-fit text-muted">{icon}</div>}
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorBanner({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p role="alert" className={cn("error-banner", className)}>
      {children}
    </p>
  );
}

export function LoadingState({
  label = "جارِ التحميل…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return <p className={cn("text-sm text-muted", className)}>{label}</p>;
}
