import type { Commit, DiffFile, GitCapability } from "../../../plugin-api.ts";
import { parseUnifiedDiff } from "./diff-parse.ts";

/** Marks squashed hunks where a later commit replaced lines from an earlier one. */
export async function findRewrites(git: GitCapability, baseSha: string, commits: Commit[], files: DiffFile[]): Promise<void> {
  if (commits.length < 2) return;

  const diffs: DiffFile[][] = [];
  for (let i = 0; i < commits.length; i++) {
    const from = i === 0 ? baseSha : commits[i - 1]!.sha;
    diffs.push(parseUnifiedDiff(await git.diff(from, commits[i]!.sha)));
  }

  const commitIndex = new Map(commits.map((commit, index) => [commit.sha, index]));
  const touched = new Set<string>();
  const counts = new Map<string, { by: number; of: number; path: string; lines: number }>();

  for (let j = 0; j < commits.length; j++) {
    const current = diffs[j]!;
    if (j > 0) {
      const parent = commits[j - 1]!.sha;
      for (const file of current) {
        const path = file.oldPath ?? file.path;
        if (!touched.has(path) || !file.hunks.some((hunk) => hunk.lines.some((line) => line.kind === "del"))) continue;
        const entries = new Map((await git.blame(baseSha, parent, path, "forward")).map((entry) => [entry.line, entry]));
        for (const hunk of file.hunks) {
          let lineNo = hunk.oldStart;
          for (const line of hunk.lines) {
            if (line.kind === "add") continue;
            if (line.kind === "del") {
              const sha = entries.get(lineNo)?.sha;
              const of = sha === undefined ? undefined : commitIndex.get(sha);
              if (of !== undefined && of < j) {
                const key = `${j}\0${of}\0${file.path}`;
                const item = counts.get(key) ?? { by: j, of, path: file.path, lines: 0 };
                item.lines++;
                counts.set(key, item);
              }
            }
            lineNo++;
          }
        }
      }
    }
    for (const file of current) touched.add(file.path);
  }

  for (const { by, of, path, lines } of counts.values()) {
    const file = files.find((candidate) => candidate.path === path);
    if (!file) continue;
    for (const hunk of file.hunks) {
      if (hunk.lines.some((line) => line.kind === "add" && line.commit === by)) {
        (hunk.rewrites ??= []).push({ by, of, lines });
      }
    }
  }
}
