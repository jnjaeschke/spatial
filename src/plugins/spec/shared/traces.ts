import type { Artifact, SequenceLane } from "../../../plugin-api.ts";
import { plural } from "../../../web/graph-api.ts";
import type { HopResult, SpecTraceCheckData, SpecTraceData, SpecTraceEntry, TraceHop } from "./types.ts";

/** The current version of every trace (the latest `SpecTrace` per `traceId`), in the order the traces were created. */
export function latestTraces(artifacts: Artifact[]): SpecTraceData[] {
  const traces = new Map<string, SpecTraceData>();
  for (const artifact of artifacts) if (artifact.type === "SpecTrace") traces.set((artifact.data as SpecTraceData).traceId, artifact.data as SpecTraceData);
  return [...traces.values()];
}

/** A trace as markdown without app links: one line per entry, `[<title> step <path>](<url>)`, later lines prefixed `→ `, each note indented under its entry. */
export function traceMarkdown(trace: SpecTraceData, algorithms: ReadonlyMap<string, { title: string; url: string }>): string {
  return trace.entries.flatMap((entry, index) => {
    const algorithm = algorithms.get(entry.anchor);
    if (!algorithm) throw new Error(`${entry.anchor} is not loaded`);
    const line = `${index ? "→ " : ""}[${algorithm.title} step ${entry.step}](${algorithm.url})`;
    const note = entry.note.trim();
    return note ? [line, ...note.split("\n").map((part) => `  ${part}`)] : [line];
  }).join("\n");
}

/** The hop of entry `index`: its own, or for hand-built entries the one the path implies (`start` first, `next` in the same algorithm, `return` to an algorithm earlier on the path, else `call`). */
export function hopOf(entries: SpecTraceEntry[], index: number): TraceHop {
  const entry = entries[index]!;
  if (entry.hop) return entry.hop;
  if (index === 0) return "start";
  if (entries[index - 1]!.anchor === entry.anchor) return "next";
  return entries.slice(0, index).some((e) => e.anchor === entry.anchor) ? "return" : "call";
}

const ROW_KIND: Record<TraceHop, TraceRow["kind"]> = { start: "call", call: "call", return: "return", next: "self", async: "async" };

/** One hop of a trace from entry `index` to entry `index + 1`, labelled with the target step and note. */
export interface TraceRow { index: number; from: string; to: string; kind: "call" | "return" | "self" | "async"; step: string; note: string }

/** A trace as a sequence diagram; a hop's kind comes from `hopOf`. */
export function traceSequence(trace: SpecTraceData, titles: ReadonlyMap<string, string>): { lanes: SequenceLane[]; rows: TraceRow[] } {
  const lanes: SequenceLane[] = [];
  const add = (anchor: string) => { if (!lanes.some((lane) => lane.id === anchor)) lanes.push({ id: anchor, label: titles.get(anchor) ?? anchor, note: anchor }); };
  const rows: TraceRow[] = [];
  trace.entries.forEach((entry, index) => {
    add(entry.anchor);
    const next = trace.entries[index + 1];
    if (!next) return;
    rows.push({ index, from: entry.anchor, to: next.anchor, kind: ROW_KIND[hopOf(trace.entries, index + 1)], step: next.step, note: next.note });
    add(next.anchor);
  });
  return { lanes, rows };
}

/** The latest version of a trace, its latest check, and whether that check is of an earlier version. */
export interface TraceStatus { trace: Artifact<SpecTraceData>; check: Artifact<SpecTraceCheckData> | null; outdated: boolean }

export function traceStatus(artifacts: Artifact[], traceId: string): TraceStatus | null {
  const trace = artifacts.findLast((a) => a.type === "SpecTrace" && (a.data as SpecTraceData).traceId === traceId) as Artifact<SpecTraceData> | undefined;
  if (!trace) return null;
  const check = (artifacts.findLast((a) => a.type === "SpecTraceCheck" && (a.data as SpecTraceCheckData).traceId === traceId) ?? null) as Artifact<SpecTraceCheckData> | null;
  return { trace, check, outdated: check !== null && check.data.traceArtifactId !== trace.id };
}

/**
 * `entries` with a step added by hand. `openers` are the steps the step's box was opened from. When none is the last entry's
 * algorithm but one is earlier on the trace, the walk went back there first: that step goes in before the new one, so the
 * trace does not show the new algorithm as called from the last one.
 */
export function appendStep(entries: SpecTraceEntry[], entry: SpecTraceEntry, openers: { anchor: string; step: string }[]): SpecTraceEntry[] {
  const last = entries.at(-1);
  const from = openers.filter((opener) => opener.step);
  if (!last || last.anchor === entry.anchor || from.some((opener) => opener.anchor === last.anchor)) return [...entries, entry];
  const back = from.map((opener) => ({ opener, at: entries.findLastIndex((item) => item.anchor === opener.anchor) })).filter((item) => item.at >= 0).sort((a, b) => b.at - a.at)[0];
  return back ? [...entries, { anchor: back.opener.anchor, step: back.opener.step, note: "" }, entry] : [...entries, entry];
}

/** The check that marks a trace's entries, edges and notes: the one of its latest version, else none. */
export const currentCheck = (status: TraceStatus | null): SpecTraceCheckData | null => status && !status.outdated ? status.check?.data ?? null : null;

/** `fails · 9 steps, 1 unverified hop, 0 unsupported notes`; without the answer for a scenario. Counts are of the checked version. */
export function verdictLine(check: SpecTraceCheckData): string {
  const counts = [plural(check.hops.length, "step"), plural(check.hops.filter((hop: HopResult) => !hop.ok).length, "unverified hop"), plural(check.notes.filter((note) => note !== null && !note.supported).length, "unsupported note")].join(", ") + (check.droppedCode.length ? `, ${plural(check.droppedCode.length, "code reference dropped", "code references dropped")}` : "");
  return check.verdict ? `${check.verdict.answer} · ${counts}` : counts;
}
