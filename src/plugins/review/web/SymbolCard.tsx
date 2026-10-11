import { createContext, useEffect, useMemo, useRef, useState } from "react";
import { numberLines, type Artifact, type DiffData, type SessionState } from "../../../web/plugin-api.ts";
import type { IntroducedSymbolsData } from "../shared/types.ts";
import { latestSymbols } from "./symbols.ts";

/** Display data for one introduced symbol site; `index` is its position in the symbol's `sites`. */
export interface SymbolCardSite { index: number; label: string; code: string[]; commit: number }
/** Pointer callbacks shared by review hunk nodes. */
export interface SymbolMarkHandlers {
  hover(mark: { name: string } | null, rect: DOMRect | null): void;
  click(mark: { name: string }, rect: DOMRect): void;
}
export const SymbolMarkContext = createContext<SymbolMarkHandlers | null>(null);

/** A fixed hover card listing the declaration and definition sites of a symbol. */
export function SymbolCard({ name, sites, rect, stack, pinned, onEnter, onLeave, onSite }: { name: string; sites: SymbolCardSite[]; rect: DOMRect; stack: boolean; pinned: boolean; onEnter(): void; onLeave(): void; onSite(site: number): void }) {
  const below = window.innerHeight - rect.bottom >= 326;
  return <div role="dialog" aria-label={`Symbol ${name}`} data-testid="symbol-card" className="symbol-card" style={{ left: Math.min(rect.left, window.innerWidth - 360), ...(below ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6, maxHeight: rect.top - 12 }) }} onMouseEnter={onEnter} onMouseLeave={onLeave} data-pinned={pinned}>
    <strong>{name}</strong>
    {sites.map((site, index) => <section key={`${site.label}-${index}`}><button type="button" data-testid={`symbol-site-${index}`} onClick={() => onSite(site.index)}>{site.label}{stack ? ` · C${site.commit + 1}` : ""}</button><pre>{site.code.join("\n")}</pre></section>)}
  </div>;
}

/** The sites of a symbol that resolve in `diff`, each with its row and the added rows directly after it (at most two). */
function symbolSites(diff: DiffData, symbol: IntroducedSymbolsData["symbols"][string]): SymbolCardSite[] {
  return symbol.sites.flatMap((site, index) => {
    const hunk = diff.files.find((file) => file.path === site.path)?.hunks.find((item) => item.id === site.hunkId);
    const rows = hunk ? numberLines(hunk) : [];
    const at = rows.findIndex((row) => row.new === site.line);
    if (at < 0) return [];
    const following = [];
    for (const row of rows.slice(at + 1)) { if (row.kind !== "add" || following.length === 2) break; following.push(row); }
    return [{ index, label: `${site.kind === "declaration" ? "declared" : "defined"} in ${site.path}:${site.line}`, code: [rows[at]!, ...following].map((row) => row.text), commit: site.commit }];
  });
}

interface OpenCard { name: string; rect: DOMRect; pinned: boolean }

const SHOW_DELAY = 300;
const HIDE_DELAY = 200;

/**
 * Hover-card state for symbol marks: `marks` goes to `SymbolMarkContext`, `card` is rendered next to the canvas.
 * Marks stop their click's propagation, so the document click listener only sees clicks outside any mark.
 */
export function useSymbolCard(state: SessionState, diff: Artifact<DiffData> | null, openSite: (name: string, site: number) => void) {
  const [open, setOpen] = useState<OpenCard | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hovered = useRef<string | null>(null);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const close = () => { clear(); hovered.current = null; setOpen(null); };
  const scheduleHide = () => { clear(); timer.current = setTimeout(() => setOpen((current) => current?.pinned ? current : null), HIDE_DELAY); };
  const marks = useMemo<SymbolMarkHandlers>(() => ({
    hover: (mark, rect) => {
      if (!mark || !rect) { hovered.current = null; scheduleHide(); return; }
      if (hovered.current === mark.name) return;
      hovered.current = mark.name;
      clear();
      timer.current = setTimeout(() => setOpen((current) => current?.pinned && current.name === mark.name ? current : { name: mark.name, rect, pinned: false }), SHOW_DELAY);
    },
    click: (mark, rect) => { hovered.current = mark.name; clear(); setOpen({ name: mark.name, rect, pinned: true }); },
  }), []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const outside = (event: MouseEvent) => { if (!(event.target instanceof Element && event.target.closest("[data-testid='symbol-card']"))) close(); };
    document.addEventListener("keydown", key);
    document.addEventListener("click", outside);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("click", outside); clear(); };
  }, []);
  const symbol = diff && open ? latestSymbols(state, diff.id)?.symbols[open.name] : undefined;
  const sites = diff && symbol ? symbolSites(diff.data, symbol) : [];
  const card = open && sites.length > 0 ? <SymbolCard name={open.name} sites={sites} rect={open.rect} stack={!!diff && diff.data.commits.length > 1} pinned={open.pinned} onEnter={clear} onLeave={scheduleHide} onSite={(site) => { const name = open.name; close(); openSite(name, site); }} /> : null;
  return { marks, card };
}
