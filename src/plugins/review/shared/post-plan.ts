import type { ReviewFindingData, UserCommentData } from "./types.ts";
import type { Artifact, DiffData, Id } from "../../../plugin-api.ts";
import { numberLines } from "../../../web/graph-api.ts";
import { commitRevision } from "./phabricator.ts";
import type { PostableComment } from "./postable-comments.ts";
import type { PhabRevision } from "./phabricator.ts";

export interface PostTarget { commit: number; path: string; side: "old" | "new"; start: number; end: number }
export type FindingLines = NonNullable<ReviewFindingData["lines"]>;

/** Maps a comment range on the squashed diff to the commit that owns it and that commit's own line numbers, or explains why not. */
export function postTarget(diff: DiffData, lines: FindingLines): PostTarget | { skip: string } {
  if (diff.commits.length === 1) return { commit: 0, ...lines };

  const file = diff.files.find((candidate) => candidate.path === lines.path);
  const inRange = file?.hunks.flatMap((hunk) => numberLines(hunk).map((row, index) => ({ ...row, ...hunk.lines[index] }))).filter((row) => {
    const line = lines.side === "new" ? row.new : row.old;
    return line !== undefined && line >= lines.start && line <= lines.end;
  }) ?? [];
  const changedKind = lines.side === "new" ? "add" : "del";
  const changed = inRange.filter((row) => row.kind === changedKind);
  if (changed.some((row) => row.commit === undefined)) return { skip: "Line has no commit attribution" };
  const owners = new Set(changed.map((row) => row.commit!));
  if (owners.size > 1) return { skip: "Comment spans lines of several commits" };
  if (owners.size === 1) {
    if (inRange.some((row) => row.kind === "ctx")) return { skip: "Comment range mixes changed and unchanged lines" };
    const commit = [...owners][0]!;
    const ownLines = changed.map((row) => row.commitLine!);
    return { commit, path: changed.find((row) => row.commitPath)?.commitPath ?? lines.path, side: lines.side, start: Math.min(...ownLines), end: Math.max(...ownLines) };
  }
  if (lines.side === "new") return { commit: diff.commits.length - 1, ...lines };
  return { skip: "Old-side line without commit attribution" };
}

export interface RevisionDrafts {
  commit: number;
  revision: PhabRevision;
  items: { source: Artifact; commentId: Id; body: string; target: PostTarget }[];
}

export function postPlan(diff: DiffData, candidates: PostableComment[]): { revisions: RevisionDrafts[]; skipped: { source: Id; reason: string }[] } {
  const revisions = new Map<number, RevisionDrafts>();
  const skipped: { source: Id; reason: string }[] = [];
  for (const { source, comment, body, lines } of candidates) {
    if (!lines) {
      skipped.push({ source: source.id, reason: source.type === "ReviewFinding" ? "Finding has no line range" : "Comment has no line range" });
      continue;
    }
    const target = postTarget(diff, lines);
    if ("skip" in target) {
      skipped.push({ source: source.id, reason: target.skip });
      continue;
    }
    const revision = commitRevision(diff.commits[target.commit]!);
    if (!revision) {
      skipped.push({ source: source.id, reason: `Commit ${diff.commits[target.commit]!.sha.slice(0, 12)} has no Differential Revision trailer` });
      continue;
    }
    let group = revisions.get(target.commit);
    if (!group) {
      group = { commit: target.commit, revision, items: [] };
      revisions.set(target.commit, group);
    }
    const commentId = comment.type === "UserComment" ? ((comment.data as UserCommentData).replaces ?? comment.id) : comment.id;
    group.items.push({ source, commentId, body, target });
  }
  return { revisions: [...revisions.values()].sort((a, b) => a.commit - b.commit), skipped };
}
