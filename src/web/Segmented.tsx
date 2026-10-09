import type { ReactNode } from "react";

/** One choice out of a few, as pressed buttons in a group. */
export function Segmented<T extends string>({ label, options, value, onChange, className }: { label: string; options: { value: T; label: ReactNode; title?: string }[]; value: T; onChange(value: T): void; className?: string }) {
  return <span className={["segmented", className].filter(Boolean).join(" ")} role="group" aria-label={label}>
    {options.map((option) => <button key={option.value} type="button" aria-pressed={option.value === value} aria-label={option.title} title={option.title} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </span>;
}
