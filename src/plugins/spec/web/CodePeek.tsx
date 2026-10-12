import { useEffect, useState, type ReactNode } from "react";
import { HoverCard, promiseCache, useHoverCard } from "../../../web/plugin-api.ts";
import type { Engine } from "../../../plugin-api.ts";
import { specClient } from "./client.ts";

type Lines = { start: number; at: number | null; lines: string[] };
/** Fetched windows by session, engine, path, line and quote; code at a revision does not change while the page lives. */
const fetched = promiseCache<Lines>();

/** Wraps a code link: hovering it shows the lines around `line` (where `quote` is now) in a card, with `note` above them. */
export function CodePeek({ sessionId, engine, path, line, quote, note, children }: { sessionId: string; engine: Engine; path: string; line: number; quote: string | null; note?: string; children: ReactNode }) {
  const card = useHoverCard<DOMRect>();
  const rect = card.open;
  const [lines, setLines] = useState<Lines | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!rect || lines || error) return;
    let live = true;
    fetched(JSON.stringify([sessionId, engine, path, line, quote]), () => specClient.code(sessionId, engine, path, line, quote)).then((next) => { if (live) setLines(next); }, (failure: Error) => { if (live) setError(failure.message); });
    return () => { live = false; };
  }, [rect, lines, error, sessionId, engine, path, line, quote]);
  return <span className="code-peek" onMouseEnter={(event) => card.show(event.currentTarget.getBoundingClientRect())} onMouseLeave={card.hide}>
    {children}
    {rect && <HoverCard label={`${path}:${line}`} rect={rect} testId="code-peek" onEnter={card.keep} onLeave={card.hide}>
      <strong>{path}:{lines?.at ?? line}</strong>
      {note && <p className="code-peek-note">{note}</p>}
      {error ? <p className="error">{error}</p> : !lines ? <p className="empty">Loading…</p> : <>
        {lines.at === null && <p className="code-peek-note">This line is no longer at the current revision.</p>}
        <pre>{lines.lines.map((text, index) => <span key={index} className={lines.start + index === lines.at ? "peek-line at" : "peek-line"}><span className="peek-ln">{lines.start + index}</span>{text}{"\n"}</span>)}</pre>
      </>}
    </HoverCard>}
  </span>;
}
