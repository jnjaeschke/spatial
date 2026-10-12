import type { Id, Runtime } from "../../../plugin-api.ts";
import type { SpecAlgorithmData, SpecOpenedData, SpecTraceData, TraceQuestion } from "../shared/types.ts";
import { hopOf } from "../shared/traces.ts";
import { openSpec } from "./open.ts";

/** A question for the tracer; `anchors` are the open boxes, `contextTraceId` the active trace. */
export interface TraceRequest { traceId: string; mode: TraceQuestion["mode"]; question: string; anchors: string[]; contextTraceId: string | null }

/** Opens the boxes of a trace's `known` anchors: from the previous step along call and async hops, as roots otherwise; returns how many `SpecOpened` it stored. */
export async function openTraceBoxes(rt: Runtime, sessionId: Id, trace: SpecTraceData, known: ReadonlySet<string> | ReadonlyMap<string, unknown>): Promise<number> {
  let stored = 0;
  for (const [index, entry] of trace.entries.entries()) {
    if (!known.has(entry.anchor)) continue;
    const previous = trace.entries[index - 1];
    const hop = hopOf(trace.entries, index);
    const from = previous && previous.anchor !== entry.anchor && (hop === "call" || hop === "async") && known.has(previous.anchor) ? { anchor: previous.anchor, step: previous.step } : null;
    const opened = rt.store.listArtifacts(sessionId, "SpecOpened").map((a) => a.data as SpecOpenedData);
    const open = opened.some((o) => o.anchor === entry.anchor);
    if (open && (!from || opened.some((o) => o.anchor === entry.anchor && o.from?.anchor === from.anchor && o.from.step === from.step))) continue;
    await openSpec(rt, sessionId, entry.anchor, from);
    stored++;
  }
  return stored;
}

/** Whether a `checkTrace` task of the trace is pending or running. */
export const traceCheckRunning = (rt: Runtime, sessionId: Id, traceId: string) =>
  rt.store.listTasks(sessionId).some((task) => task.kind === "checkTrace" && (task.status === "pending" || task.status === "running") && (task.input as { traceId: string }).traceId === traceId);

/** Runs the tracer for a question, then checks its trace and opens the boxes of its known anchors, also when the check fails. */
export async function generateTrace(rt: Runtime, sessionId: Id, request: TraceRequest): Promise<void> {
  const { traceArtifactId } = await rt.run<{ traceArtifactId: Id }>(sessionId, "traceSpec", request);
  try {
    await rt.run(sessionId, "checkTrace", { traceId: request.traceId, traceArtifactId });
  } finally {
    const known = new Set(rt.store.listArtifacts(sessionId, "SpecAlgorithm").map((a) => (a.data as SpecAlgorithmData).ref));
    await openTraceBoxes(rt, sessionId, rt.store.getArtifact<SpecTraceData>(traceArtifactId).data, known);
  }
}
