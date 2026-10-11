import { useCallback, useMemo, useState } from "react";
import type { Artifact } from "../../../plugin-api.ts";
import { specClient } from "./client.ts";
import { TraceWriter } from "./trace-writer.ts";

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

/** The session's trace writer: every trace edit of the view goes through it. */
export function useTraceWriter(sessionId: string, artifacts: Artifact[]): TraceWriter {
  const writer = useMemo(() => new TraceWriter(async (trace) => (await specClient.saveTrace(sessionId, trace)).artifactId), [sessionId]);
  writer.observe(artifacts);
  return writer;
}
