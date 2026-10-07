"use client";

import { useId, useMemo, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { matchesQuery } from "../../lib/search";

export type SearchOption = {
  value: string | number;
  label: string;
  hint?: string;
  disabled?: boolean;
};

/**
 * A searchable dropdown that stays in normal flow (no portal, no positioning),
 * so it can live inside a modal without escaping it.
 */
export function SearchSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
  disabled,
  hint,
  emptyText = "لا توجد نتائج",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<SearchOption>;
  placeholder: string;
  required?: boolean;
  disabled?: boolean;
  hint?: ReactNode;
  emptyText?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const selected = useMemo(
    () => options.find((option) => String(option.value) === value) ?? null,
    [options, value]
  );
  const visible = useMemo(
    () => options.filter((option) => matchesQuery(query, option.label, option.hint)),
    [options, query]
  );

  function close() {
    setOpen(false);
    setQuery("");
  }

  function choose(option: SearchOption) {
    if (option.disabled) return;
    onChange(String(option.value));
    close();
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (!open) return;
      event.stopPropagation();
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Tab") {
      close();
      return;
    }
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setOpen(true);
        setHighlight(0);
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((index) => Math.min(index + 1, visible.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      // an open list owns Enter, even with no match: never submit the form
      event.preventDefault();
      const option = visible[highlight];
      if (option) choose(option);
    }
  }

  const inputValue = open ? query : (selected?.label ?? "");

  return (
    <div className="block space-y-1.5">
      <span className="block text-sm font-medium">{label}</span>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && visible[highlight] ? `${listId}-${highlight}` : undefined}
        aria-autocomplete="list"
        className="input"
        placeholder={placeholder}
        value={inputValue}
        disabled={disabled}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onBlur={() => close()}
        onKeyDown={onKeyDown}
      />
      {required && (
        <input
          type="text"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          required
          value={value}
          onChange={() => {}}
        />
      )}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
      {open && (
        <div
          id={listId}
          role="listbox"
          className="sheet max-h-60 overflow-y-auto p-1"
          onMouseDown={(event) => event.preventDefault()}
        >
          {visible.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted">{emptyText}</p>
          ) : (
            visible.map((option, index) => (
              <button
                key={option.value}
                type="button"
                id={`${listId}-${index}`}
                role="option"
                aria-selected={String(option.value) === value}
                aria-disabled={option.disabled || undefined}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(option)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-start text-sm",
                  index === highlight && "bg-primary/10",
                  option.disabled && "cursor-not-allowed opacity-50"
                )}
              >
                <span className="truncate">{option.label}</span>
                {option.hint && (
                  <span className="shrink-0 text-xs text-muted">{option.hint}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
