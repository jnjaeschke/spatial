import { createContext, useCallback, useMemo, useState } from "react";
import { effectiveCollapsed, expandAllExplicit, expandExplicit, toggleExplicit, type CollapseExplicit } from "./collapse-state.ts";

/** Collapsed node ids. Client-only view state, kept per session in localStorage. */
export const CollapseContext = createContext<{ collapsed: ReadonlySet<string>; toggle(id: string): void; reveal(nodeId: string, collapseId: string): void } | null>(null);

export function collapseStorageKey(sessionId: string): string { return `spatial:collapse:${sessionId}`; }

export function serializeCollapseState(explicit: CollapseExplicit): string {
  return JSON.stringify({ collapsed: [...explicit.collapsed], expanded: [...explicit.expanded] });
}

export function useCollapsed(sessionId: string, defaults: ReadonlySet<string>) {
  const key = collapseStorageKey(sessionId);
  const [explicit, setExplicit] = useState<CollapseExplicit>(() => {
    const stored = JSON.parse(localStorage.getItem(key) ?? "{\"collapsed\":[],\"expanded\":[]}") as { collapsed: string[]; expanded: string[] };
    return { collapsed: new Set(stored.collapsed), expanded: new Set(stored.expanded) };
  });
  const collapsed = useMemo(() => effectiveCollapsed(defaults, explicit), [defaults, explicit]);
  const toggle = useCallback((id: string) => setExplicit((prev) => {
    const next = toggleExplicit(defaults, prev, id);
    localStorage.setItem(key, serializeCollapseState(next));
    return next;
  }), [defaults, key]);
  const expandAll = useCallback(() => setExplicit(() => {
    const next = expandAllExplicit(defaults);
    localStorage.setItem(key, serializeCollapseState(next));
    return next;
  }), [defaults, key]);
  const reveal = useCallback((id: string) => setExplicit((prev) => {
    const next = expandExplicit(prev, id);
    localStorage.setItem(key, serializeCollapseState(next));
    return next;
  }), [key]);
  return { collapsed, toggle, expandAll, reveal };
}

declare global {
  interface HighlightRegistry {
    highlightsFromPoint(x: number, y: number): { highlight: Highlight; ranges: AbstractRange[] }[];
  }
}
