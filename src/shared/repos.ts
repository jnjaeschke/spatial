import type { Session } from "./types.ts";

/** Display name of a repo: the directory holding `.git`, or a bare repo's directory name without `.git`. */
export function repoName(repoDir: string): string {
  const parts = repoDir.split("/").filter(Boolean);
  const last = parts.at(-1) ?? repoDir;
  return last === ".git" ? parts.at(-2) ?? repoDir : last.replace(/\.git$/, "");
}

/** Newest first by `createdAt`; ties keep input order. */
export function newestFirst(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Sessions per repo, sessions newest first, groups ordered by their newest session. */
export function groupByRepo(sessions: Session[]): { repoDir: string; name: string; sessions: Session[] }[] {
  const groups = new Map<string, Session[]>();
  for (const session of newestFirst(sessions)) groups.set(session.repoDir, [...(groups.get(session.repoDir) ?? []), session]);
  return [...groups].map(([repoDir, items]) => ({ repoDir, name: repoName(repoDir), sessions: items }));
}
