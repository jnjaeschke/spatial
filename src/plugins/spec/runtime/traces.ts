import type { Artifact, Id, Runtime, SpecHop } from "../../../plugin-api.ts";
import type { NoteResult, SpecAlgorithmData, SpecOpenedData, SpecTraceCheckData, SpecTraceData, SpecTraceEntry, TraceQuestion, TraceVerdict } from "../shared/types.ts";
import { asyncEffectIds, checkHops, witnessKey, type TraceFacts } from "../shared/trace-check.ts";
import { hopOf } from "../shared/traces.ts";
import { parseSteps } from "../shared/steps.ts";
import { citedText } from "../shared/summary-check.ts";
import { SpecNotFoundError } from "../tasks/load-spec-algorithm/task.ts";
import { openSpec } from "./open.ts";

/** A question for the tracer; `anchors` are the open boxes, `contextTraceId` the active trace. */
export interface TraceRequest { traceId: string; mode: TraceQuestion["mode"]; question: string; anchors: string[]; contextTraceId: string | null }

/** How `loadSpecAlgorithm` prefixes webspec-index's reason in a `SpecNotFoundError`. */
const NOT_FOUND = "Spec section not found: ";

/** The facts hop checks need: every entry's algorithm (or webspec-index's reason it has none) and the witness paths of async candidates. */
export async function loadTraceFacts(rt: Runtime, sessionId: Id, entries: SpecTraceEntry[]): Promise<TraceFacts> {
  const algorithms = new Map<string, SpecAlgorithmData>(), unknown = new Map<string, string>(), witnesses = new Map<string, SpecHop[]>();
  for (const ref of new Set(entries.map((entry) => entry.anchor))) {
    try {
      const { algorithmId } = await rt.run<{ algorithmId: Id }>(sessionId, "loadSpecAlgorithm", { ref });
      algorithms.set(ref, rt.store.getArtifact<SpecAlgorithmData>(algorithmId).data);
    } catch (error) {
      if (!((error as Error).cause instanceof SpecNotFoundError)) throw error;
      unknown.set(ref, (error as Error).message.slice(NOT_FOUND.length));
    }
  }
  for (const [index, entry] of entries.entries()) {
    const previous = entries[index - 1];
    const source = previous && algorithms.get(previous.anchor);
    if (!source || hopOf(entries, index) !== "async" || entry.anchor === previous.anchor) continue;
    for (const effectId of asyncEffectIds(source, previous.step)) {
      const key = witnessKey(previous.anchor, effectId);
      if (witnesses.has(key)) continue;
      try { witnesses.set(key, (await rt.run<{ hops: SpecHop[] }>(sessionId, "loadEffectPath", { ref: previous.anchor, effectId })).hops); }
      catch (error) { if (!(error as Error).message.startsWith("No witness path")) throw error; }
    }
  }
  return { algorithms, unknown, witnesses };
}

/** Opens the boxes of a trace's known anchors: from the previous step along call and async hops, as roots otherwise; returns how many `SpecOpened` it stored. */
export async function openTraceBoxes(rt: Runtime, sessionId: Id, trace: SpecTraceData, facts: TraceFacts): Promise<number> {
  let stored = 0;
  for (const [index, entry] of trace.entries.entries()) {
    if (!facts.algorithms.has(entry.anchor)) continue;
    const previous = trace.entries[index - 1];
    const hop = hopOf(trace.entries, index);
    const from = previous && previous.anchor !== entry.anchor && (hop === "call" || hop === "async") && facts.algorithms.has(previous.anchor) ? { anchor: previous.anchor, step: previous.step } : null;
    const opened = rt.store.listArtifacts(sessionId, "SpecOpened").map((a) => a.data as SpecOpenedData);
    const open = opened.some((o) => o.anchor === entry.anchor);
    if (open && (!from || opened.some((o) => o.anchor === entry.anchor && o.from?.anchor === from.anchor && o.from.step === from.step))) continue;
    await openSpec(rt, sessionId, entry.anchor, from);
    stored++;
  }
  return stored;
}

/** Checks one `SpecTrace` version, verifies non-empty notes on existing steps, and stores its `SpecTraceCheck`. `open` also opens the trace's boxes. */
export async function checkTrace(rt: Runtime, sessionId: Id, traceArtifactId: Id, verdict: TraceVerdict | null, open: boolean): Promise<Artifact<SpecTraceCheckData>> {
  const trace = rt.store.getArtifact<SpecTraceData>(traceArtifactId);
  const { entries } = trace.data;
  const facts = await loadTraceFacts(rt, sessionId, entries);
  if (open) await openTraceBoxes(rt, sessionId, trace.data, facts);
  const hops = checkHops(entries, facts);
  const steps = new Map([...facts.algorithms].map(([ref, algorithm]) => [ref, parseSteps(algorithm.content)]));
  const missing = (entry: SpecTraceEntry) => facts.unknown.has(entry.anchor) ? `${entry.anchor} is not a known spec section` : steps.get(entry.anchor)!.some((step) => step.number === entry.step) ? null : `${entry.anchor} has no step ${entry.step}`;
  const asked = entries.flatMap((entry, index) => entry.note.trim() && missing(entry) === null ? [index] : []);
  let notesTaskId: Id | null = null;
  const verdicts = new Map<number, NoteResult>();
  if (asked.length) {
    const items = asked.map((index) => { const entry = entries[index]!; return { anchor: entry.anchor, step: entry.step, stepText: citedText(steps.get(entry.anchor)!, entry.step), note: entry.note }; });
    const run = rt.start<{ notes: NoteResult[] }>(sessionId, "verifyTraceNotes", { traceId: trace.data.traceId, items });
    notesTaskId = run.taskId;
    (await run.done).notes.forEach((note, i) => verdicts.set(asked[i]!, note));
  }
  const notes = entries.map((entry, index) => entry.note.trim() ? verdicts.get(index) ?? { supported: false, reason: missing(entry)! } : null);
  const data: SpecTraceCheckData = { traceId: trace.data.traceId, traceArtifactId, verdict, hops, notes, notesTaskId };
  const artifact = rt.store.putArtifact<SpecTraceCheckData>({ sessionId, type: "SpecTraceCheck", status: "verified", data, provenance: { taskId: trace.provenance.taskId } });
  rt.emit(sessionId, "runtime", "artifact.created", { artifactId: artifact.id, type: artifact.type });
  return artifact;
}

/** Runs the tracer for a question, then checks its trace and opens its boxes. */
export async function generateTrace(rt: Runtime, sessionId: Id, request: TraceRequest): Promise<void> {
  const { traceArtifactId, verdict } = await rt.run<{ traceArtifactId: Id; verdict: TraceVerdict | null }>(sessionId, "traceSpec", request);
  await checkTrace(rt, sessionId, traceArtifactId, verdict, true);
}
