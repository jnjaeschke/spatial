import { useEffect } from "react";

/** How long the Undo after closing a box stays offered. */
const UNDO_MS = 8000;

/** A toast offering to undo the last close for a few seconds; the closed item stays reopenable from its host's title row afterwards. */
export function UndoClose({ label, onUndo, onDone }: { label: string; onUndo(): void; onDone(): void }) {
  useEffect(() => { const timer = setTimeout(onDone, UNDO_MS); return () => clearTimeout(timer); }, [label, onDone]);
  return <div className="toast undo-close" role="status" data-testid="undo-close">
    <span>{label}</span>
    <button type="button" onClick={() => { onUndo(); onDone(); }}>Undo</button>
  </div>;
}
