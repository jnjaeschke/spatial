import { type Artifact, type DiffData, type DiffFile, type Hunk, type SessionState, DiffView, SidePanel } from "../../../web/plugin-api.ts";
import type { IntroducedSymbolsData } from "../shared/types.ts";
import { latestSymbols } from "./symbols.ts";

export interface SymbolDefinition { name: string; site: IntroducedSymbolsData["symbols"][string]; file: DiffFile; hunk: Hunk }

/** Where the latest `IntroducedSymbols` of `diff` says `name` is defined; null when it does not list the name. */
export function findSymbol(state: SessionState, diff: Artifact<DiffData> | null, name: string): SymbolDefinition | null {
  const site = diff && latestSymbols(state, diff.id)?.symbols[name];
  const file = site && diff.data.files.find((item) => item.path === site.path);
  const hunk = site && file?.hunks.find((item) => item.id === site.hunkId);
  return site && file && hunk ? { name, site, file, hunk } : null;
}

/** The hunk defining an introduced symbol, its defining row focused. */
export function SymbolDetails({ sessionId, diffId, symbol, stack, onGo, onClose, onBack }: { sessionId: string; diffId: string; symbol: SymbolDefinition; stack: boolean; onGo(): void; onClose(): void; onBack?: () => void }) {
  return <SidePanel className="review-detail-panel" title={<>{symbol.name}{stack ? ` · defined in C${symbol.site.commit + 1}` : ""}</>} closeLabel="Close symbol panel" testId="symbol-panel" onClose={onClose} headerExtra={onBack && <button aria-label="Back" onClick={onBack}>←</button>}>
    <div className="hunk-node"><DiffView sessionId={sessionId} diffId={diffId} file={symbol.file} hunk={symbol.hunk} rowClass={(row) => row.new === symbol.site.line ? "focus" : undefined} /></div>
    <button data-testid="symbol-go-to-change" onClick={onGo}>Go to change</button>
  </SidePanel>;
}
