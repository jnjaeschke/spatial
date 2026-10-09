import { useState, type KeyboardEvent, type ReactElement, type Ref } from "react";
import { draftTexts } from "./chat-context.ts";
import { composerKey } from "./composer-key.ts";

export interface ComposerProps {
  value: string;
  onChange(value: string): void;
  /** Called on Enter when `canSubmit`. */
  onSubmit(): void;
  canSubmit: boolean;
  label: string;
  placeholder?: string;
  rows?: number;
  /** Runs first; calling preventDefault skips the composer's own handling. */
  onKeyDown?(event: KeyboardEvent<HTMLTextAreaElement>): void;
  textareaRef?: Ref<HTMLTextAreaElement>;
  autoFocus?: boolean;
  className?: string;
}

/** Textarea with the shared key policy; Escape is left to the caller or enclosing Box. */
export function Composer({ value, onChange, onSubmit, canSubmit, label, placeholder, rows, onKeyDown, textareaRef, autoFocus, className }: ComposerProps): ReactElement {
  return <textarea className={`composer${className ? ` ${className}` : ""}`} ref={textareaRef} aria-label={label} placeholder={placeholder} rows={rows} autoFocus={autoFocus} value={value} onChange={(event) => onChange(event.currentTarget.value)} onKeyDown={(event) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const action = composerKey({ ...event, isComposing: event.nativeEvent.isComposing });
    if (action === "newline") {
      event.preventDefault();
      const el = event.currentTarget;
      el.setRangeText("\n", el.selectionStart, el.selectionEnd, "end");
      onChange(el.value);
    } else if (action === "submit") {
      event.preventDefault();
      if (canSubmit) onSubmit();
    }
  }} />;
}

/** Text that survives box closing and reopening, keyed by draft id. */
export function useDraftText(draftId: string | null | undefined, initial = ""): [string, (value: string) => void, () => void] {
  const [text, setText] = useState(() => draftId ? draftTexts.get(draftId) ?? initial : initial);
  const set = (value: string) => { setText(value); if (draftId) draftTexts.set(draftId, value); };
  const clear = () => { setText(""); if (draftId) draftTexts.delete(draftId); };
  return [text, set, clear];
}
