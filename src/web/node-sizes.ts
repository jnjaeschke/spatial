import { useCallback, useState } from "react";

/** A size the user gave a node; a dimension never resized follows the content. */
export interface NodeSize { width?: number; height?: number }
type Sizes = Record<string, NodeSize>;

/** The stored sizes by node id; entries of any other shape are ignored. */
export function parseSizes(json: string | null): Sizes {
  const parsed: unknown = JSON.parse(json ?? "{}");
  const isSize = (value: unknown): value is NodeSize => typeof value === "object" && value !== null && Object.values(value).length > 0 && Object.values(value).every((v) => typeof v === "number");
  return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, value]) => isSize(value))) as Sizes;
}

/** Node sizes by node id, kept per session in localStorage. */
export function useNodeSizes(sessionId: string) {
  const key = `spatial-ide:sizes:${sessionId}`;
  const [sizes, setSizes] = useState<Sizes>(() => parseSizes(localStorage.getItem(key)));
  const setSize = useCallback((id: string, size: NodeSize) => setSizes((prev) => {
    const next = { ...prev, [id]: { ...prev[id], ...size } };
    localStorage.setItem(key, JSON.stringify(next));
    return next;
  }), [key]);
  const clear = useCallback(() => {
    localStorage.removeItem(key);
    setSizes({});
  }, [key]);
  return { sizes, setSize, clear };
}
