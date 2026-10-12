import { defineTask, type Artifact, type CodeSearch, type Engine, type Id, type SpecHop } from "../../../../plugin-api.ts";
import type { NoteResult, SpecAlgorithmData, SpecTraceCheckData, SpecTraceData, SpecTraceEntry, TraceCodeRef } from "../../shared/types.ts";
import { asyncEffectIds, checkHops, witnessKey, type TraceFacts } from "../../shared/trace-check.ts";
import { hopOf } from "../../shared/traces.ts";
import { parseSteps } from "../../shared/steps.ts";
import { citedText } from "../../shared/summary-check.ts";
import { SpecNotFoundError } from "../load-spec-algorithm/task.ts";
import { NoWitnessError } from "../load-effect-path/task.ts";
import { codeUrl, quoteProblem } from "../../shared/engine.ts";

/** Whether each code reference's quote is at its line in the engine's current source, with its permalink; each file and engine revision is read once. */
export async function checkCodeRefs(codeSearch: Record<Engine, Pick<CodeSearch, "file" | "tip">>, refs: TraceCodeRef[], signal: AbortSignal): Promise<({ ok: true; url: string } | { ok: false; reason: string })[]> {
  const files = new Map<string, Promise<string | null>>();
  const tips = new Map<Engine, Promise<{ repoBase: string; rev: string }>>();
  const read = (ref: TraceCodeRef) => { const key = `${ref.engine}|${ref.path}`; if (!files.has(key)) files.set(key, codeSearch[ref.engine].file(ref.path, signal)); return files.get(key)!; };
  // tip() is cached for up to an hour while file reads the newest revision.
  const tip = (engine: Engine) => { if (!tips.has(engine)) tips.set(engine, codeSearch[engine].tip()); return tips.get(engine)!; };
  const results: ({ ok: true; url: string } | { ok: false; reason: string })[] = [];
  for (const ref of refs) {
    const problem = quoteProblem(await read(ref), ref);
    results.push(problem ? { ok: false, reason: problem } : { ok: true, url: codeUrl({ engine: ref.engine, ...(await tip(ref.engine)) }, ref.path, ref.line) });
  }
  return results;
}

/** What loading trace facts needs: running a task (`ctx.run` inside a task, `rt.run` for a session outside one) and reading its artifacts. */
export interface TraceFactsLoader { run<O>(kind: string, input: unknown): Promise<O>; artifacts: { get<T>(id: Id): Artifact<T> } }

/** The facts hop checks need: every entry's algorithm (or webspec-index's reason it has none) and the witness paths of async candidates. */
export async function loadTraceFacts({ run, artifacts }: TraceFactsLoader, entries: SpecTraceEntry[]): Promise<TraceFacts> {
  const algorithms = new Map<string, SpecAlgorithmData>(), unknown = new Map<string, string>(), witnesses = new Map<string, SpecHop[]>();
  for (const ref of new Set(entries.map((entry) => entry.anchor))) {
    try {
      algorithms.set(ref, artifacts.get<SpecAlgorithmData>((await run<{ algorithmId: Id }>("loadSpecAlgorithm", { ref })).algorithmId).data);
    } catch (error) {
      const cause = (error as Error).cause;
      if (!(cause instanceof SpecNotFoundError)) throw error;
      unknown.set(ref, cause.reason);
    }
  }
  for (const [index, entry] of entries.entries()) {
    const previous = entries[index - 1];
    const source = previous && algorithms.get(previous.anchor);
    if (!source || hopOf(entries, index) !== "async" || entry.anchor === previous.anchor) continue;
    for (const effectId of asyncEffectIds(source, previous.step)) {
      const key = witnessKey(previous.anchor, effectId);
      if (witnesses.has(key)) continue;
      try { witnesses.set(key, (await run<{ hops: SpecHop[] }>("loadEffectPath", { ref: previous.anchor, effectId })).hops); }
      catch (error) { if (!((error as Error).cause instanceof NoWitnessError)) throw error; }
    }
  }
  return { algorithms, unknown, witnesses };
}

/** Checks one `SpecTrace` version: its hops, and its non-empty notes on existing steps through `verifyTraceNotes`; stores the `SpecTraceCheck` with the verdict of the trace's generated version. */
export const checkTrace = defineTask<{ traceId: string; traceArtifactId: Id }, { checkId: Id }>({
  kind: "checkTrace",
  async run(ctx, { traceId, traceArtifactId }) {
    const { entries } = ctx.artifacts.get<SpecTraceData>(traceArtifactId).data;
    const facts = await loadTraceFacts(ctx, entries);
    const hops = checkHops(entries, facts);
    const steps = new Map([...facts.algorithms].map(([ref, algorithm]) => [ref, parseSteps(algorithm.content)]));
    const missing = (entry: SpecTraceEntry) => facts.unknown.has(entry.anchor) ? `${entry.anchor} is not a known spec section` : steps.get(entry.anchor)!.some((step) => step.number === entry.step) ? null : `${entry.anchor} has no step ${entry.step}`;
    const refs = entries.flatMap((entry, e) => (entry.code ?? []).map((code, r) => ({ e, r, code })));
    const results = refs.length ? await checkCodeRefs(ctx.codeSearch, refs.map((x) => x.code), ctx.signal) : [];
    const code = refs.flatMap((item, index) => results[index]!.ok ? [{ entry: item.e, ref: item.r, url: (results[index] as { ok: true; url: string }).url }] : []);
    const droppedCode = refs.flatMap((item, index) => results[index]!.ok ? [] : [{ entry: item.e, ref: item.r, reason: (results[index] as { ok: false; reason: string }).reason }]);
    const asked = entries.flatMap((entry, index) => entry.note.trim() && missing(entry) === null ? [index] : []);
    const verdicts = new Map<number, NoteResult>();
    if (asked.length) {
      const items = asked.map((index) => { const entry = entries[index]!; return { anchor: entry.anchor, step: entry.step, stepText: citedText(steps.get(entry.anchor)!, entry.step), note: entry.note, code: code.filter((ref) => ref.entry === index).map((ref) => { const citation = entry.code![ref.ref]!; return `${citation.engine} ${citation.path}:${citation.line}: ${citation.quote}`; }) }; });
      (await ctx.run<{ notes: NoteResult[] }>("verifyTraceNotes", { traceId, items })).notes.forEach((note, i) => verdicts.set(asked[i]!, note));
    }
    const notes = entries.map((entry, index) => entry.note.trim() ? verdicts.get(index) ?? { supported: false, reason: missing(entry)! } : null);
    const generated = ctx.artifacts.view().artifacts.find((a) => a.type === "SpecTrace" && (a.data as SpecTraceData).traceId === traceId && (a.data as SpecTraceData).verdict !== undefined);
    const data: SpecTraceCheckData = { traceId, traceArtifactId, verdict: (generated?.data as SpecTraceData | undefined)?.verdict ?? null, hops, notes, code, droppedCode };
    return { checkId: ctx.artifacts.put("SpecTraceCheck", "verified", data).id };
  },
});
