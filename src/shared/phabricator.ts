import type { DiffData } from "./types.ts";

export interface PhabRevision { host: string; id: number }

/** The head commit's Differential Revision trailer, or null. */
export function phabRevision(diff: DiffData): PhabRevision | null {
  const match = /^Differential Revision: (https?:\/\/[^\s/]+)\/D(\d+)\s*$/m.exec(diff.commits.at(-1)?.body ?? "");
  return match ? { host: match[1]!, id: Number(match[2]) } : null;
}
