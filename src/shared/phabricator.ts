import type { Commit, DiffData } from "./types.ts";

export interface PhabRevision { host: string; id: number }

/** The Differential Revision trailer of one commit, or null. */
export function commitRevision(commit: Commit): PhabRevision | null {
  const match = /^Differential Revision: (https?:\/\/[^\s/]+)\/D(\d+)\s*$/m.exec(commit.body);
  return match ? { host: match[1]!, id: Number(match[2]) } : null;
}

/** The head commit's Differential Revision trailer, or null. */
export function phabRevision(diff: DiffData): PhabRevision | null {
  const head = diff.commits.at(-1);
  return head ? commitRevision(head) : null;
}
