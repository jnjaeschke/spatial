import type { ButtonHTMLAttributes } from "react";

/** A button with a visible native tooltip matching its accessible name. */
export function IconButton({ label, ...props }: { label: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "title">) {
  return <button type="button" {...props} aria-label={label} title={label} />;
}
