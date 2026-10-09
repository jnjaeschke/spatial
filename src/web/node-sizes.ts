import { useCallback, useState } from "react";
import type { ZoomLevel } from "./graph.ts";

/** A size the user gave a node; a dimension never resized follows the content. */
export interface NodeSize { width?: number; height?: number }
type Sizes = Partial<Record<ZoomLevel, Record<string, NodeSize>>>;

/** Node sizes, kept per session and zoom level in localStorage. */
export function useNodeSizes(sessionId: string) {
  const key = `spatial-ide:sizes:${sessionId}`;
  const [sizes, setSizes] = useState<Sizes>(() => JSON.parse(localStorage.getItem(key) ?? "{}") as Sizes);
  const setSize = useCallback((level: ZoomLevel, id: string, size: NodeSize) => setSizes((prev) => {
    const next = { ...prev, [level]: { ...prev[level], [id]: { ...prev[level]?.[id], ...size } } };
    localStorage.setItem(key, JSON.stringify(next));
    return next;
  }), [key]);
  const clear = useCallback(() => {
    localStorage.removeItem(key);
    setSizes({});
  }, [key]);
  return { sizes, setSize, clear };
}
