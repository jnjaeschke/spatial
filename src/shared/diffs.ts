import type { Artifact, DiffData, Id, InterdiffData, Link, PatchNarrativeData, TaskRecord } from "./types.ts";

/** Diff artifacts in creation order. */
export function diffsOf(artifacts: Artifact[]): Artifact<DiffData>[] {
  return artifacts.filter((artifact) => artifact.type === "Diff") as Artifact<DiffData>[];
}

export function latestDiff(artifacts: Artifact[]): Artifact<DiffData> | null {
  return diffsOf(artifacts).at(-1) ?? null;
}

/** 1-based position of a Diff among the session's Diffs; the review UI calls it "Epoch N". */
export function diffNumber(artifacts: Artifact[], diffId: Id): number {
  const index = diffsOf(artifacts).findIndex((artifact) => artifact.id === diffId);
  if (index < 0) throw new Error(`${diffId} is not a Diff in the artifacts`);
  return index + 1;
}

/** Latest PatchNarrative whose `data.diffId === diffId`, or null. */
export function narrativeOf(artifacts: Artifact[], diffId: Id): Artifact<PatchNarrativeData> | null {
  return artifacts.filter((artifact) => artifact.type === "PatchNarrative" && (artifact.data as PatchNarrativeData).diffId === diffId).at(-1) as Artifact<PatchNarrativeData> | undefined ?? null;
}

/** Refs that produced `diffId`: the input of the succeeded `importDiff` task whose `output.diffId` is that Diff; null when none. */
export function importRefs(tasks: TaskRecord[], diffId: Id): { base: string; head: string } | null {
  const task = tasks.find((item) => item.kind === "importDiff" && item.status === "succeeded" && (item.output as { diffId?: string } | null)?.diffId === diffId);
  const input = task?.input as { base?: unknown; head?: unknown } | undefined;
  return typeof input?.base === "string" && typeof input.head === "string" ? { base: input.base, head: input.head } : null;
}

/** Refs the session was created with: `importRefs` of the first Diff (later imports record resolved SHAs). Null when none. */
export function sessionRefs(artifacts: Artifact[], tasks: TaskRecord[]): { base: string; head: string } | null {
  const first = diffsOf(artifacts)[0];
  return first ? importRefs(tasks, first.id) : null;
}

/** Latest Interdiff linked `about → diffId`, or null. */
export function interdiffOf(artifacts: Artifact[], links: Link[], diffId: Id): Artifact<InterdiffData> | null {
  const ids = new Set(links.filter((link) => link.kind === "about" && link.to === diffId).map((link) => link.from));
  return artifacts.filter((artifact) => artifact.type === "Interdiff" && ids.has(artifact.id)).at(-1) as Artifact<InterdiffData> | undefined ?? null;
}
