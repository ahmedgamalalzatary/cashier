import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function SelectField({
  label,
  children,
  className,
  hint,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-sm font-medium">{label}</span>
      <select className="input" {...props}>
        {children}
      </select>
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}
