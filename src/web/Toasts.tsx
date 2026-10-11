import { IconButton } from "./IconButton.tsx";
import { useState } from "react";
import type { NotifyPayload } from "../shared/types.ts";
import { api } from "./api.ts";

export function Toasts({ items, onDismiss }: { items: NotifyPayload[]; onDismiss(id: string): void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  return <div className="toasts" data-testid="toasts" aria-live="polite">
    {items.map((n) => <div className="toast" data-testid={`toast-${n.id}`} key={n.id}>
      <strong>{n.title}</strong>
      {n.body && <div>{n.body}</div>}
      {errors[n.id] && <div role="alert">{errors[n.id]}</div>}
      <div className="toast-actions">
        {n.action && <button onClick={() => {
          void api.runAction(n.action!.path).then(() => onDismiss(n.id), (e: Error) => setErrors((current) => ({ ...current, [n.id]: e.message })));
        }}>{n.action.label}</button>}
        <IconButton label="Dismiss notification" onClick={() => onDismiss(n.id)}>Dismiss</IconButton>
      </div>
    </div>)}
  </div>;
}
