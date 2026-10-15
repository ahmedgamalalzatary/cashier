import type { ReactNode } from "react";

export function CategoryButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className="chip"
    >
      {children}
    </button>
  );
}
