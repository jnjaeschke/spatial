import { useEffect, useRef, useState } from "react";
import { IconButton } from "./IconButton.tsx";
import { recentEntries } from "./view-history.ts";

/** A menu of this tab's visited places in the session; choosing one traverses to its history entry. */
export function RecentPlaces({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [, refresh] = useState(0);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const onChange = () => refresh((n) => n + 1);
    navigation.addEventListener("currententrychange", onChange);
    return () => navigation.removeEventListener("currententrychange", onChange);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  const entries = navigation.entries();
  const recent = open ? recentEntries(entries.map((entry) => ({ key: entry.key, url: entry.url ?? "", state: entry.getState() })), navigation.currentEntry?.index ?? -1, sessionId) : [];
  return <span ref={root} className="place-recent">
    <IconButton label="Recent places" data-testid="place-recent" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>⌄</IconButton>
    {open && <div role="menu" data-testid="place-recent-menu" className="place-recent-menu">{recent.map((entry) => <button key={entry.key} type="button" role="menuitem" disabled={entry.current} aria-current={entry.current ? "true" : undefined} onClick={() => { setOpen(false); void navigation.traverseTo(entry.key).finished!.catch((error: DOMException) => { if (error.name !== "AbortError") throw error; }); }}>{entry.label}</button>)}</div>}
  </span>;
}
