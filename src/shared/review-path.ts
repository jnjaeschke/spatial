import type { DiffData, Hunk, SemanticChange } from "./types.ts";

/** Commit (index into `diff.commits`) that owns a hunk: the commit of its first attributed changed line. A hunk without attributed lines belongs to the last commit, as unattributed new-side lines do when posting (`postTarget`). 0 for single-commit diffs. */
export function hunkCommit(diff: DiffData, hunk: Hunk): number {
  return hunk.lines.find((line) => line.kind !== "ctx" && line.commit !== undefined)?.commit ?? diff.commits.length - 1;
}

/** Commit that owns a change: that of its first hunk (stack narration validation makes all its hunks agree); the last commit for a change without hunks. */
export function changeCommit(diff: DiffData, change: SemanticChange): number {
  const first = change.hunkIds[0];
  const hunk = first === undefined ? undefined : diff.files.flatMap((file) => file.hunks).find((item) => item.id === first);
  return hunk ? hunkCommit(diff, hunk) : diff.commits.length - 1;
}
