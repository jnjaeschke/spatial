import type { SessionListing } from "./types.ts";

/** Display name of a repo: the directory holding `.git`, or a bare repo's directory name without `.git`. */
export function repoName(repoDir: string): string {
  const parts = repoDir.split("/").filter(Boolean);
  const last = parts.at(-1) ?? repoDir;
  return last === ".git" ? parts.at(-2) ?? repoDir : last.replace(/\.git$/, "");
}

/** Most recently active first; ties keep input order. */
export function recentFirst(sessions: SessionListing[]): SessionListing[] {
  return [...sessions].sort((a, b) => b.lastActive.localeCompare(a.lastActive));
}

/** Sessions per repo, most recently active first, groups ordered by their most recently active session. */
export function groupByRepo(sessions: SessionListing[]): { repoDir: string; name: string; sessions: SessionListing[] }[] {
  const groups = new Map<string, SessionListing[]>();
  for (const session of recentFirst(sessions)) groups.set(session.repoDir, [...(groups.get(session.repoDir) ?? []), session]);
  return [...groups].map(([repoDir, items]) => ({ repoDir, name: repoName(repoDir), sessions: items }));
}
