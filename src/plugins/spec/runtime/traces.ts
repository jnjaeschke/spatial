import type { Id, KnowledgeEntry, Runtime } from "../../../plugin-api.ts";
import type { SpecAlgorithmData, SpecOpenedData, SpecTraceData, TraceCodeRef, TraceQuestion } from "../shared/types.ts";
import { hopOf } from "../shared/traces.ts";
import { openSpec } from "./open.ts";
import { siteKey } from "../shared/engine.ts";
import { checkCodeRefs } from "../tasks/check-trace/task.ts";
import { storedMapping, updateMapping } from "./mappings.ts";
import { siteAtTip } from "./engine-map.ts";

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

/** Stores a trace code reference as a proposed step of the engine mapping (a user action): re-verifies the quote, finds the site whose function holds the line at the current revision, and writes the step at the mapping's revision through `updateMapping`. */
export async function addMappingStep(rt: Runtime, sessionId: Id, proposal: { ref: string; step: string; code: TraceCodeRef }): Promise<KnowledgeEntry> {
  const { engine, path, line, quote } = proposal.code;
  const signal = new AbortController().signal;
  const [result] = await checkCodeRefs(rt.codeSearch, [proposal.code], signal);
  if (!result!.ok) throw new Error(result!.reason);
  const stored = storedMapping(rt.knowledge, engine, proposal.ref);
  if (!stored) throw new Error(`No ${engine} mapping of ${proposal.ref} is stored`);
  let target: { key: string; at: number; fnLine: number } | null = null;
  for (const site of stored.sites) {
    if (site.stale || site.path !== path) continue;
    const found = await siteAtTip(rt.codeSearch[engine], site, signal);
    if (found?.fn && found.fn.line <= line && line <= found.fn.end && (!target || found.fn.line > target.fnLine)) target = { key: siteKey(site), at: found.at, fnLine: found.fn.line };
  }
  if (!target) throw new Error(`No ${engine} site of ${proposal.ref} holds ${path}:${line} at the current revision`);
  const { key, at } = target;
  return updateMapping(rt, sessionId, engine, proposal.ref, { by: "user", sessionId }, (mapping) => {
    const site = mapping?.sites.find((s) => !s.stale && siteKey(s) === key);
    if (!mapping || !site) throw new Error(`The ${engine} mapping of ${proposal.ref} changed; try again`);
    if (site.steps.some((s) => s.step === proposal.step)) throw new Error(`${site.signature} maps step ${proposal.step} already`);
    const stepLine = line - (at - site.line);
    return { ...mapping, sites: mapping.sites.map((s) => s === site ? { ...s, steps: [...s.steps, { step: proposal.step, line: stepLine, end: stepLine, quote, verdict: "proposed" as const, detail: "Cited by a spec trace", origin: "trace" as const }] } : s) };
  })!;
}
