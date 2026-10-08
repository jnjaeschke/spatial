import { useCallback, useState } from "react";
import { LAYERS, type Layer } from "../plugins/review/web/graph.ts";

const KEY = "spatial-ide:layers";

/** Hidden canvas layers. A client-only preference for all sessions, kept in localStorage. */
export function useLayers() {
  const [hidden, setHidden] = useState<ReadonlySet<Layer>>(() => new Set((JSON.parse(localStorage.getItem(KEY) ?? "[]") as Layer[]).filter((layer) => LAYERS.includes(layer))));
  const toggle = useCallback((layer: Layer) => setHidden((prev) => {
    const next = new Set(prev);
    if (!next.delete(layer)) next.add(layer);
    localStorage.setItem(KEY, JSON.stringify([...next]));
    return next;
  }), []);
  return { hidden, toggle };
}
