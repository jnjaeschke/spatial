import type { Artifact } from "../../../plugin-api.ts";
import type { PhabCommentData, PhabThreadSummaryData } from "./types.ts";
import { latestByPhid } from "./phab-comments.ts";

/** Phabricator threads of a revision: each root comment (no `replyTo`, or a `replyTo` not among the comments) with its replies in `dateCreated` order. Uses the latest artifact per comment phid. */
export function phabThreads(comments: Artifact<PhabCommentData>[]): { rootPhid: string; comments: Artifact<PhabCommentData>[] }[] {
  const latest = latestByPhid(comments);
  const roots = new Map<string, Artifact<PhabCommentData>[]>();
  const rootOf = (comment: Artifact<PhabCommentData>): string => {
    let current = comment;
    const visited = new Set<string>();
    while (current.data.replyTo && !visited.has(current.data.phid)) {
      visited.add(current.data.phid);
      const parent = latest.get(current.data.replyTo);
      if (!parent || parent.data.revision !== comment.data.revision) break;
      current = parent;
    }
    return current.data.phid;
  };
  for (const comment of latest.values()) {
    if (comment.data.own) continue;
    const rootPhid = rootOf(comment);
    const thread = roots.get(rootPhid) ?? [];
    thread.push(comment);
    roots.set(rootPhid, thread);
  }
  return [...roots].map(([rootPhid, items]) => ({ rootPhid, comments: items.sort((a, b) => a.data.dateCreated - b.data.dateCreated || a.data.txId - b.data.txId) }));
}

/** The latest `PhabThreadSummary` for `rootPhid` whose `commentPhids` equal the thread's current comment phids (as sets); null otherwise. */
export function currentSummary(artifacts: Artifact[], rootPhid: string, commentPhids: string[]): Artifact<PhabThreadSummaryData> | null {
  const expected = new Set(commentPhids);
  return (artifacts.filter((item): item is Artifact<PhabThreadSummaryData> => item.type === "PhabThreadSummary" && (item.data as PhabThreadSummaryData).rootPhid === rootPhid)
    .filter((item) => item.data.commentPhids.length === expected.size && item.data.commentPhids.every((phid) => expected.has(phid)))
    .at(-1) ?? null);
}
