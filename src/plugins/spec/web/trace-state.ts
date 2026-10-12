import { useCallback, useMemo, useState } from "react";
import type { Artifact } from "../../../plugin-api.ts";
import { specClient } from "./client.ts";
import { TraceWriter } from "./trace-writer.ts";

const activeKey = (sessionId: string) => `spatial:spec-trace:${sessionId}`;
const panelKey = (sessionId: string) => `spatial:spec-trace-panel:${sessionId}`;

/** The active trace of a session: client view state in localStorage. */
export function useActiveTrace(sessionId: string): [string | null, (traceId: string | null) => void] {
  const key = activeKey(sessionId);
  const [active, setActive] = useState<string | null>(() => localStorage.getItem(key));
  const set = useCallback((traceId: string | null) => {
    if (traceId === null) localStorage.removeItem(key);
    else localStorage.setItem(key, traceId);
    setActive(traceId);
  }, [key]);
  return [active, set];
}

/** Whether the trace panel of a session is open: client view state in localStorage. */
export function useTracePanel(sessionId: string): [boolean, (open: boolean) => void] {
  const key = panelKey(sessionId);
  const [open, setOpen] = useState(() => localStorage.getItem(key) === "1");
  const set = useCallback((value: boolean) => { localStorage.setItem(key, value ? "1" : "0"); setOpen(value); }, [key]);
  return [open, set];
}

/** Makes `traceId` the active trace of a session and opens the trace panel, for a view about to mount. */
export function showTrace(sessionId: string, traceId: string): void {
  localStorage.setItem(activeKey(sessionId), traceId);
  localStorage.setItem(panelKey(sessionId), "1");
}

/** The session's trace writer: every trace edit of the view goes through it. */
export function useTraceWriter(sessionId: string, artifacts: Artifact[]): TraceWriter {
  const writer = useMemo(() => new TraceWriter(async (trace) => (await specClient.saveTrace(sessionId, trace)).artifactId), [sessionId]);
  writer.observe(artifacts);
  return writer;
}
