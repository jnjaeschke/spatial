import { createContext, useCallback, useMemo, useState } from "react";
import { effectiveCollapsed, expandAllExplicit, expandExplicit, toggleExplicit, type CollapseExplicit } from "./collapse-state.ts";
import type { Artifact, DiagramData, SequenceStep } from "../shared/types.ts";

/** Collapsed node ids. Client-only view state, kept per session in localStorage. */
export type DiagramStepTarget = { changeNodeId: string; hunkId: string; row: { side: "new" | "old"; line: number } } | null;
export const CollapseContext = createContext<{ collapsed: ReadonlySet<string>; toggle(id: string): void; reveal(nodeId: string, collapseId: string): void; stepTarget?(diagram: Artifact<DiagramData>, step: SequenceStep): DiagramStepTarget; revealStep?(nodeId: string, hunkId: string, line: number): void } | null>(null);

export function useCollapsed(sessionId: string, defaults: ReadonlySet<string>) {
  const key = `spatial-ide:collapse:${sessionId}`;
  const [explicit, setExplicit] = useState<CollapseExplicit>(() => {
    const stored = JSON.parse(localStorage.getItem(key) ?? "{\"collapsed\":[],\"expanded\":[]}") as { collapsed: string[]; expanded: string[] };
    return { collapsed: new Set(stored.collapsed), expanded: new Set(stored.expanded) };
  });
  const collapsed = useMemo(() => effectiveCollapsed(defaults, explicit), [defaults, explicit]);
  const toggle = useCallback((id: string) => setExplicit((prev) => {
    const next = toggleExplicit(defaults, prev, id);
    localStorage.setItem(key, JSON.stringify({ collapsed: [...next.collapsed], expanded: [...next.expanded] }));
    return next;
  }), [defaults, key]);
  const expandAll = useCallback(() => setExplicit((prev) => {
    const next = expandAllExplicit(defaults);
    localStorage.setItem(key, JSON.stringify({ collapsed: [...next.collapsed], expanded: [...next.expanded] }));
    return next;
  }), [defaults, key]);
  const reveal = useCallback((id: string) => setExplicit((prev) => {
    const next = expandExplicit(prev, id);
    localStorage.setItem(key, JSON.stringify({ collapsed: [...next.collapsed], expanded: [...next.expanded] }));
    return next;
  }), [key]);
  return { collapsed, toggle, expandAll, reveal };
}

declare global {
  interface HighlightRegistry {
    highlightsFromPoint(x: number, y: number): { highlight: Highlight; ranges: AbstractRange[] }[];
  }
}
