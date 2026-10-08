import type { Commit, DiffData } from "../../../plugin-api.ts";

export interface PhabRevision { host: string; id: number }

/** Parses `D123` or `https://host/D123` (optional trailing slash); null for anything else, including `D0`. `host` is null when only the id is given. */
export function parseRevisionRef(text: string): { host: string | null; id: number } | null {
  const match = /^(?:(https?:\/\/[^\s/]+)\/)?D([1-9]\d*)\/?$/.exec(text.trim());
  return match ? { host: match[1] ?? null, id: Number(match[2]) } : null;
}

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
