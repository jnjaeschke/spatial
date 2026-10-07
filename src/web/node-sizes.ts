import { useCallback, useState } from "react";
import type { ZoomLevel } from "./graph.ts";

type Sizes = Partial<Record<ZoomLevel, Record<string, number>>>;

/** Node widths, kept per session and zoom level in localStorage. */
export function useNodeSizes(sessionId: string) {
  const key = `spatial-ide:sizes:${sessionId}`;
  const [sizes, setSizes] = useState<Sizes>(() => JSON.parse(localStorage.getItem(key) ?? "{}") as Sizes);
  const setWidth = useCallback((level: ZoomLevel, id: string, width: number) => setSizes((prev) => {
    const next = { ...prev, [level]: { ...prev[level], [id]: width } };
    localStorage.setItem(key, JSON.stringify(next));
    return next;
  }), [key]);
  const clear = useCallback(() => {
    localStorage.removeItem(key);
    setSizes({});
  }, [key]);
  return { sizes, setWidth, clear };
}
