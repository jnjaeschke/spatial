import type { SessionState } from "../../../web/plugin-api.ts";
import type { IntroducedSymbolsData } from "../shared/types.ts";

/** A marked identifier in a row's text. */
export interface SymbolMark { start: number; end: number; name: string; highlight: "sym-this" | "sym-earlier"; title: string }

/** The latest IntroducedSymbols artifact for a Diff, or null before it exists. */
export function latestSymbols(state: SessionState, diffId: string): IntroducedSymbolsData | null {
  const artifact = state.artifacts.findLast((item) => item.type === "IntroducedSymbols" && (item.data as IntroducedSymbolsData).diffId === diffId);
  return (artifact?.data as IntroducedSymbolsData | undefined) ?? null;
}

/** Whole-word occurrences of introduced names, omitting symbols defined after this row's commit. */
export function symbolMarks(text: string, rowCommit: number, symbols: IntroducedSymbolsData["symbols"]): SymbolMark[] {
  const marks: SymbolMark[] = [];
  for (const match of text.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
    const name = match[0]!;
    const definition = symbols[name]?.sites.reduce((earliest, site) => !earliest || site.commit < earliest.commit ? site : earliest, undefined as typeof symbols[string]["sites"][number] | undefined);
    if (!definition || definition.commit > rowCommit) continue;
    const start = match.index!;
    marks.push({ start, end: start + name.length, name, highlight: definition.commit === rowCommit ? "sym-this" : "sym-earlier", title: definition.commit === rowCommit ? "New in this patch" : `New in C${definition.commit + 1}` });
  }
  return marks;
}
