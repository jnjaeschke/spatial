import { useEffect, useRef, useState, type ReactNode } from "react";
import { HoverCard } from "../../../web/plugin-api.ts";
import type { Engine } from "../../../plugin-api.ts";
import { specClient } from "./client.ts";

type Lines = { start: number; at: number | null; lines: string[] };
const SHOW_DELAY = 300;
const HIDE_DELAY = 200;
/** Fetched windows by session, engine, path, line and quote; code at a revision does not change while the page lives. */
const fetched = new Map<string, Promise<Lines>>();

/** Wraps a code link: hovering it shows the lines around `line` (where `quote` is now) in a card, with `note` above them. */
export function CodePeek({ sessionId, engine, path, line, quote, note, children }: { sessionId: string; engine: Engine; path: string; line: number; quote: string | null; note?: string; children: ReactNode }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [lines, setLines] = useState<Lines | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const hide = () => { clear(); timer.current = setTimeout(() => setRect(null), HIDE_DELAY); };
  useEffect(() => clear, []);
  useEffect(() => {
    if (!rect || lines || error) return;
    const key = JSON.stringify([sessionId, engine, path, line, quote]);
    if (!fetched.has(key)) fetched.set(key, specClient.code(sessionId, engine, path, line, quote).catch((failure: Error) => { fetched.delete(key); throw failure; }));
    let live = true;
    fetched.get(key)!.then((next) => { if (live) setLines(next); }, (failure: Error) => { if (live) setError(failure.message); });
    return () => { live = false; };
  }, [rect, lines, error, sessionId, engine, path, line, quote]);
  return <span className="code-peek" onMouseEnter={(event) => { clear(); const target = event.currentTarget.getBoundingClientRect(); timer.current = setTimeout(() => setRect(target), SHOW_DELAY); }} onMouseLeave={hide}>
    {children}
    {rect && <HoverCard label={`${path}:${line}`} rect={rect} testId="code-peek" onEnter={clear} onLeave={hide}>
      <strong>{path}:{lines?.at ?? line}</strong>
      {note && <p className="code-peek-note">{note}</p>}
      {error ? <p className="error">{error}</p> : !lines ? <p className="empty">Loading…</p> : <>
        {lines.at === null && <p className="code-peek-note">This line is no longer at the current revision.</p>}
        <pre>{lines.lines.map((text, index) => <span key={index} className={lines.start + index === lines.at ? "peek-line at" : "peek-line"}><span className="peek-ln">{lines.start + index}</span>{text}{"\n"}</span>)}</pre>
      </>}
    </HoverCard>}
  </span>;
}
