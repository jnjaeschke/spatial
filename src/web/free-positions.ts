import { useCallback, useState } from "react";

export interface FreePosition { x: number; y: number }
type Positions = Record<string, FreePosition>;

/** User placed node positions, kept per session in localStorage. */
export function useFreePositions(sessionId: string) {
  const key = `spatial:free:${sessionId}`;
  const [positions, setPositions] = useState<Positions>(() => JSON.parse(localStorage.getItem(key) ?? "{}") as Positions);
  const update = useCallback((change: (current: Positions) => Positions) => setPositions((current) => {
    const next = change(current);
    localStorage.setItem(key, JSON.stringify(next));
    return next;
  }), [key]);
  const set = useCallback((id: string, position: FreePosition) => update((current) => ({ ...current, [id]: position })), [update]);
  const move = useCallback((from: string, to: string) => update((current) => {
    const position = current[from];
    if (!position) return current;
    const next = { ...current, [to]: position };
    delete next[from];
    return next;
  }), [update]);
  const remove = useCallback((id: string) => update((current) => {
    if (!(id in current)) return current;
    const next = { ...current };
    delete next[id];
    return next;
  }), [update]);
  return { positions, set, move, remove };
}
