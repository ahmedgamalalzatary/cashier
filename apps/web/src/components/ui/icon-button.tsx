import type { ReactNode } from "react";

export function IconButton({
  title,
  onClick,
  danger = false,
  disabled = false,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? "text-danger hover:bg-danger/10"
          : "text-muted hover:bg-line/50 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
