import type { ReactNode } from "react";

export function IconButton({
  title,
  onClick,
  danger = false,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`rounded-md p-1.5 transition-colors ${
        danger
          ? "text-danger hover:bg-danger/10"
          : "text-muted hover:bg-line/50 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
