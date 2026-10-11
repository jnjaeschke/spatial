import { useCallback, useState } from "react";

/** The active trace of a session: client view state in localStorage. */
export function useActiveTrace(sessionId: string): [string | null, (traceId: string | null) => void] {
  const key = `spatial:spec-trace:${sessionId}`;
  const [active, setActive] = useState<string | null>(() => localStorage.getItem(key));
  const set = useCallback((traceId: string | null) => {
    if (traceId === null) localStorage.removeItem(key);
    else localStorage.setItem(key, traceId);
    setActive(traceId);
  }, [key]);
  return [active, set];
}
