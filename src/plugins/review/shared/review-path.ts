import type { PatchNarrativeData, SemanticChange } from "./types.ts";
import type { ChangeReviewData } from "./types.ts";
import type {Artifact, DiffData, Hunk, Id} from "../../../plugin-api.ts";

/** Commit (index into `diff.commits`) that owns a hunk: the commit of its first attributed changed line. A hunk without attributed lines belongs to the last commit, as unattributed new-side lines do when posting (`postTarget`). 0 for single-commit diffs. */
export function hunkCommit(diff: DiffData, hunk: Hunk): number {
  return hunk.lines.find((line) => line.kind !== "ctx" && line.commit !== undefined)?.commit ?? diff.commits.length - 1;
}

/** Display-only changes for a Diff with no narration, grouped by the commit that owns each hunk. */
export function commitChanges(diff: DiffData): SemanticChange[] {
  return diff.commits.map((commit, index) => ({
    id: `C${index + 1}`, title: commit.subject, explanation: "", rationale: "", dependsOn: [], specUrls: [],
    hunkIds: diff.files.flatMap((file) => file.hunks).filter((hunk) => hunkCommit(diff, hunk) === index).map((hunk) => hunk.id),
  })).filter((change) => change.hunkIds.length > 0);
}

/** Commit that owns a change: that of its first hunk (stack narration validation makes all its hunks agree); the last commit for a change without hunks. */
export function changeCommit(diff: DiffData, change: SemanticChange): number {
  const first = change.hunkIds[0];
  const hunk = first === undefined ? undefined : diff.files.flatMap((file) => file.hunks).find((item) => item.id === first);
  return hunk ? hunkCommit(diff, hunk) : diff.commits.length - 1;
}

/** The narrative's changes plus, per commit with hunks no change claims, a trailing "Unassigned changes" change `unassigned-C<n>` (in diff order) after that commit's last change. */
export function withUnassigned(narrative: PatchNarrativeData, diff: DiffData): SemanticChange[] {
  const claimed = new Set(narrative.changes.flatMap((change) => change.hunkIds));
  const unclaimed = new Map<number, string[]>();
  for (const hunk of diff.files.flatMap((file) => file.hunks)) if (!claimed.has(hunk.id)) unclaimed.set(hunkCommit(diff, hunk), [...(unclaimed.get(hunkCommit(diff, hunk)) ?? []), hunk.id]);
  const changes = [...narrative.changes];
  for (const [commit, hunkIds] of [...unclaimed].sort((a, b) => a[0] - b[0])) {
    const owner = (change: SemanticChange) => changeCommit(diff, change);
    const last = changes.findLastIndex((change) => owner(change) === commit);
    const at = (last >= 0 ? last : changes.findLastIndex((change) => owner(change) < commit)) + 1;
    changes.splice(at, 0, { id: `unassigned-C${commit + 1}`, title: "Unassigned changes", explanation: "The narration did not place these hunks in any change.", rationale: "", hunkIds, dependsOn: [], specUrls: [] });
  }
  return changes;
}

/** Ids of the changes of `narrativeId` whose latest `ChangeReview` says reviewed. */
export function reviewedChanges(artifacts: Artifact[], narrativeId: Id): Set<string> {
  const latest = new Map<string, boolean>();
  for (const artifact of artifacts) {
    if (artifact.type !== "ChangeReview") continue;
    const data = artifact.data as ChangeReviewData;
    if (data.narrative === narrativeId) latest.set(data.change, data.reviewed);
  }
  return new Set([...latest].filter(([, reviewed]) => reviewed).map(([change]) => change));
}
