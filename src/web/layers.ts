import { useCallback, useState } from "react";

const KEY = "spatial-ide:layers";

/** Hidden canvas layers among the model's `known` ids. A client-only preference for all sessions, kept in localStorage. */
export function useLayers(known: readonly string[]) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set((JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]).filter((layer) => known.includes(layer))));
  const toggle = useCallback((layer: string) => setHidden((prev) => {
    const next = new Set(prev);
    if (!next.delete(layer)) next.add(layer);
    localStorage.setItem(KEY, JSON.stringify([...next]));
    return next;
  }), []);
  return { hidden, toggle };
}
