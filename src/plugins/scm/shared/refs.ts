import type { RefRow } from "../../../plugin-api.ts";

/** A local branch with the remote branches that are its counterpart: its upstream, or a remote branch of the same name. */
export type LocalRef = RefRow & { remotes: string[] };

const newestFirst = (a: RefRow, b: RefRow) => b.date.localeCompare(a.date);

/** Local branches (checked out ones first, then newest first), remote branches without a local counterpart (newest first), and tags. */
export function groupRefs(refs: RefRow[]): { local: LocalRef[]; remoteOnly: RefRow[]; tags: RefRow[] } {
  const remotes = refs.filter((ref) => ref.kind === "remote");
  const claimed = new Set<string>();
  const local = refs.filter((ref) => ref.kind === "head").map((head): LocalRef => {
    const counterparts = remotes.filter((remote) => remote.name === head.upstream || remote.name.slice(remote.name.indexOf("/") + 1) === head.name).map((remote) => remote.name);
    for (const name of counterparts) claimed.add(name);
    return { ...head, remotes: counterparts };
  }).sort((a, b) => Number(b.worktree !== undefined) - Number(a.worktree !== undefined) || newestFirst(a, b));
  return { local, remoteOnly: remotes.filter((remote) => !claimed.has(remote.name)).sort(newestFirst), tags: refs.filter((ref) => ref.kind === "tag") };
}
