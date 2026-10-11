import { createContext } from "react";

/** Display data for one introduced symbol site. */
export interface SymbolCardSite { label: string; code: string[]; commit: number }
/** Pointer callbacks shared by review hunk nodes. */
export interface SymbolMarkHandlers {
  hover(mark: { name: string } | null, rect: DOMRect | null): void;
  click(mark: { name: string }, rect: DOMRect): void;
}
export const SymbolMarkContext = createContext<SymbolMarkHandlers | null>(null);

/** A fixed hover card listing the declaration and definition sites of a symbol. */
export function SymbolCard({ name, sites, rect, stack, pinned, onEnter, onLeave, onSite }: { name: string; sites: SymbolCardSite[]; rect: DOMRect; stack: boolean; pinned: boolean; onEnter(): void; onLeave(): void; onSite(index: number): void }) {
  return <div role="dialog" aria-label={`Symbol ${name}`} data-testid="symbol-card" className="symbol-card" style={{ left: Math.min(rect.left, window.innerWidth - 360), top: Math.min(rect.bottom + 6, window.innerHeight - 320) }} onMouseEnter={onEnter} onMouseLeave={onLeave} data-pinned={pinned}>
    <strong>{name}</strong>
    {sites.map((site, index) => <section key={`${site.label}-${index}`}><button type="button" data-testid={`symbol-site-${index}`} onClick={() => onSite(index)}>{site.label}{stack ? ` · C${site.commit + 1}` : ""}</button><pre>{site.code.join("\n")}</pre></section>)}
  </div>;
}
