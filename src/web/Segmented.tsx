import { IconButton } from "./IconButton.tsx";
import type { ReactNode } from "react";

/** One choice out of a few, as pressed buttons in a group. */
export function Segmented<T extends string>({ label, options, value, onChange, className }: { label: string; options: { value: T; label: ReactNode; title?: string }[]; value: T; onChange(value: T): void; className?: string }) {
  return <span className={["segmented", className].filter(Boolean).join(" ")} role="group" aria-label={label}>
    {options.map((option) => <IconButton label={option.title ?? option.value} key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>{option.label}</IconButton>)}
  </span>;
}
