import type { Commit, DiffData } from "./types.ts";

export interface PhabRevision { host: string; id: number }

/** Parses a Phabricator revision URL, or returns null when the text is not one. */
export function parsePhabRevisionUrl(text: string): PhabRevision | null {
  const match = /^(https?:\/\/[^\s/]+)\/D(\d+)\/?$/.exec(text.trim());
  return match ? { host: match[1]!, id: Number(match[2]) } : null;
}

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
