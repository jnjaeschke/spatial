import type { DiffData, PatchNarrativeData, Ref } from "../../shared/types.ts";
import type { TaskContext } from "../../runtime/tasks.ts";
import { renderCommits, renderHunk } from "../narrate/render.ts";

function splitRef(ref: Ref): [string, string] {
  const i = ref.indexOf("#");
  if (i < 0) throw new Error(`Anchor must be <artifactId>#<subId>, got ${ref}`);
  return [ref.slice(0, i), ref.slice(i + 1)];
}

/** Deterministic context for an anchor: the thing being asked about, its evidence, and the commit messages. */
export function buildAnchorContext(ctx: TaskContext, anchor: Ref): string {
  const [artifactId, subId] = splitRef(anchor);
  const a = ctx.artifacts.get(artifactId);
  if (a.type === "PatchNarrative") {
    const narrative = a.data as PatchNarrativeData;
    const change = narrative.changes.find((c) => c.id === subId);
    if (!change) throw new Error(`Unknown change ${subId} in narrative ${artifactId}`);
    const diff = ctx.artifacts.get<DiffData>(narrative.diffId).data;
    const hunks = diff.files.flatMap((f) => f.hunks.filter((h) => change.hunkIds.includes(h.id)).map((h) => renderHunk(f, h)));
    return [
      `# Semantic change: ${change.title}`, "", change.explanation, "", `Why: ${change.rationale}`, "",
      "# Its hunks", "", ...hunks, "# Commit messages", "", renderCommits(diff.commits),
    ].join("\n");
  }
  if (a.type === "Diff") {
    const diff = a.data as DiffData;
    const file = diff.files.find((f) => f.hunks.some((h) => h.id === subId));
    if (!file) throw new Error(`Unknown hunk ${subId} in diff ${artifactId}`);
    const hunk = file.hunks.find((h) => h.id === subId)!;
    const narrative = ctx.artifacts.linkedTo(artifactId, "derivedFrom").filter((x) => x.type === "PatchNarrative").at(-1);
    const change = (narrative?.data as PatchNarrativeData | undefined)?.changes.find((c) => c.hunkIds.includes(subId));
    return [
      "# Hunk", "", renderHunk(file, hunk),
      ...(change ? [`# Part of semantic change: ${change.title}`, "", change.explanation, ""] : []),
      "# Commit messages", "", renderCommits(diff.commits),
    ].join("\n");
  }
  throw new Error(`Cannot chat about a ${a.type} artifact`);
}
