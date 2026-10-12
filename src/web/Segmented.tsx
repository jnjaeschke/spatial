import { IconButton } from "./IconButton.tsx";
import type { ReactNode } from "react";

/** One choice out of a few, as pressed buttons in a group. An option's `title` is its accessible name and tooltip; with a `description` instead, its text label is the name and the description the tooltip. */
export function Segmented<T extends string>({ label, options, value, onChange, className }: { label: string; options: ({ value: T; label: ReactNode; title?: string } | { value: T; label: string; description: string })[]; value: T; onChange(value: T): void; className?: string }) {
  return <span className={["segmented", className].filter(Boolean).join(" ")} role="group" aria-label={label}>
    {options.map((option) => "description" in option
      ? <button key={option.value} type="button" title={option.description} aria-pressed={option.value === value} onClick={() => onChange(option.value)}>{option.label}</button>
      : <IconButton label={option.title ?? option.value} key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>{option.label}</IconButton>)}
  </span>;
}
