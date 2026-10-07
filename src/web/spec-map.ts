import type { Artifact, Id, LineRange, SessionState, SpecStepMapData, StepLink, StepLinkKind, UnmappedLines } from "../shared/types.ts";
import type { SpecStep } from "../shared/spec-text.ts";

/** How a step is covered: its worst direct link kind, `substeps` when only its substeps are linked, else `unmapped`. */
export type StepStatus = StepLinkKind | "substeps" | "unmapped";

const WORST_FIRST: StepLinkKind[] = ["deviates", "partial", "implements", "structural"];
export const worstKind = (links: StepLink[]) => WORST_FIRST.find((kind) => links.some((link) => link.kind === kind))!;

export function stepStatuses(steps: SpecStep[], links: StepLink[]): Map<string, StepStatus> {
  const out = new Map<string, StepStatus>();
  for (const step of steps) {
    const own = links.filter((link) => link.step === step.number);
    out.set(step.number, own.length ? worstKind(own) : links.some((link) => link.step.startsWith(`${step.number}.`)) ? "substeps" : "unmapped");
  }
  return out;
}

export const lineKey = (path: string, side: LineRange["side"], line: number) => `${path}:${side}:${line}`;

/** The links covering each line, by `lineKey`. */
export function linksByLine(links: StepLink[]): Map<string, StepLink[]> {
  const out = new Map<string, StepLink[]>();
  for (const link of links) {
    for (const range of link.ranges) {
      for (let line = range.start; line <= range.end; line++) {
        const key = lineKey(range.path, range.side, line);
        const list = out.get(key) ?? [];
        if (!list.includes(link)) out.set(key, [...list, link]);
      }
    }
  }
  return out;
}

/** The unmapped entry covering each line, by `lineKey`; the first entry wins. */
export function unmappedByLine(unmapped: UnmappedLines[]): Map<string, UnmappedLines> {
  const out = new Map<string, UnmappedLines>();
  for (const entry of unmapped) for (const range of entry.ranges) for (let line = range.start; line <= range.end; line++) {
    const key = lineKey(range.path, range.side, line);
    if (!out.has(key)) out.set(key, entry);
  }
  return out;
}

/** The latest step map of a spec for a narrative, or null. */
export function latestStepMap(state: Pick<SessionState, "artifacts">, specId: Id, narrativeId: Id): Artifact<SpecStepMapData> | null {
  return (state.artifacts.findLast((a) => a.type === "SpecStepMap" && (a.data as SpecStepMapData).spec === specId && (a.data as SpecStepMapData).narrative === narrativeId) as Artifact<SpecStepMapData> | undefined) ?? null;
}
