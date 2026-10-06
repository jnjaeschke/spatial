import type { Commit, DiffFile } from "../shared/types.ts";
import type { GitCapability } from "./tasks.ts";

/** Sets commit attribution on changed lines in place. Single-commit diffs need no blame. */
export async function attribute(git: GitCapability, baseSha: string, headSha: string, commits: Commit[], files: DiffFile[]): Promise<void> {
  if (commits.length < 2) return;
  const commitIndex = new Map(commits.map((commit, index) => [commit.sha, index]));
  for (const file of files) {
    const hasAdds = file.hunks.some((hunk) => hunk.lines.some((line) => line.kind === "add"));
    const hasDels = file.hunks.some((hunk) => hunk.lines.some((line) => line.kind === "del"));
    if (hasAdds && file.status !== "deleted") {
      const entries = new Map((await git.blame(baseSha, headSha, file.path, "forward")).map((entry) => [entry.line, entry]));
      for (const hunk of file.hunks) {
        let lineNo = hunk.newStart;
        for (const line of hunk.lines) {
          if (line.kind === "del") continue;
          if (line.kind === "add") {
            const entry = entries.get(lineNo), index = entry && commitIndex.get(entry.sha);
            if (entry && index !== undefined) { line.commit = index; line.commitLine = entry.origLine; if (entry.path !== file.path) line.commitPath = entry.path; }
          }
          lineNo++;
        }
      }
    }
    if (hasDels && file.status !== "added") {
      const path = file.oldPath ?? file.path;
      const entries = new Map((await git.blame(baseSha, headSha, path, "reverse")).map((entry) => [entry.line, entry]));
      for (const hunk of file.hunks) {
        let lineNo = hunk.oldStart;
        for (const line of hunk.lines) {
          if (line.kind === "add") continue;
          if (line.kind === "del") {
            const entry = entries.get(lineNo), previous = entry?.sha === baseSha ? -1 : entry ? commitIndex.get(entry.sha) : undefined;
            if (entry && previous !== undefined && previous + 1 < commits.length) { line.commit = previous + 1; line.commitLine = entry.origLine; if (entry.path !== file.path) line.commitPath = entry.path; }
          }
          lineNo++;
        }
      }
    }
  }
}
