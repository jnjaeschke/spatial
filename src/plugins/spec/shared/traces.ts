import type { Artifact, SequenceLane } from "../../../plugin-api.ts";
import type { SpecTraceData } from "./types.ts";

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

/** One hop of a trace from entry `index` to entry `index + 1`, labelled with the target step and note. */
export interface TraceRow { index: number; from: string; to: string; kind: "call" | "return" | "self"; step: string; note: string }

/** A trace as a sequence diagram: lanes are algorithms in order of first appearance; a hop is a call when its target is new on the path so far, a return when it goes back to an earlier lane, self within one algorithm. */
export function traceSequence(trace: SpecTraceData, titles: ReadonlyMap<string, string>): { lanes: SequenceLane[]; rows: TraceRow[] } {
  const lanes: SequenceLane[] = [];
  const add = (anchor: string) => { if (!lanes.some((lane) => lane.id === anchor)) lanes.push({ id: anchor, label: titles.get(anchor) ?? anchor, note: anchor }); };
  const rows: TraceRow[] = [];
  trace.entries.forEach((entry, index) => {
    add(entry.anchor);
    const next = trace.entries[index + 1];
    if (!next) return;
    rows.push({ index, from: entry.anchor, to: next.anchor, kind: next.anchor === entry.anchor ? "self" : lanes.some((lane) => lane.id === next.anchor) ? "return" : "call", step: next.step, note: next.note });
    add(next.anchor);
  });
  return { lanes, rows };
}
