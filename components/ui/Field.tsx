import React from "react";

interface FieldProps {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  placeholder?: string;
  readOnly?: boolean;
  customClassName?: string;
}

export function Field({ id, label, value, error, onChange, placeholder, readOnly, customClassName }: FieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="text"
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        className={`flex h-11 w-full rounded-xl border bg-transparent px-4 py-2 text-sm transition-all focus:outline-none focus:ring-1 ${error ? "border-red-500 ring-red-500" : "border-zinc-200 focus:border-black dark:border-zinc-800 dark:focus:border-white"
          } ${customClassName || ""}`}
        placeholder={placeholder}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
