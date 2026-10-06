"use client";

import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { SearchSelect, type SearchOption } from "@/components/ui/search-select";

export type EntityOption = SearchOption;

/**
 * Pick an existing record or create a new one without leaving the form: the
 * proven inline-creation pattern, extracted so it is identical everywhere.
 */
export function EntityPicker({
  label,
  value,
  onChange,
  options,
  placeholder,
  createLabel,
  onCreate,
  required,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<EntityOption>;
  placeholder: string;
  createLabel: string;
  onCreate: () => void;
  required?: boolean;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  return (
    <div>
      <SearchSelect
        label={label}
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        hint={hint}
      />
      <button
        type="button"
        onClick={onCreate}
        disabled={disabled}
        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
      >
        <Plus className="size-3.5" />
        {createLabel}
      </button>
    </div>
  );
}
