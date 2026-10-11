import { IconButton } from "./IconButton.tsx";
import { useEffect, useId, useRef, type ReactNode } from "react";

/** A modal dialog that is open while mounted. Escape and × call `onClose`; the footer holds the actions, primary last. */
export function Dialog({ title, onClose, footer, children, className, testId }: { title: ReactNode; onClose(): void; footer: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  return <dialog ref={ref} className={["dialog", className].filter(Boolean).join(" ")} data-testid={testId} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><h2 id={titleId}>{title}</h2><IconButton label="Close" type="button" className="close" onClick={onClose}>×</IconButton></header>
    <div className="dialog-body">{children}</div>
    <footer>{footer}</footer>
  </dialog>;
}
