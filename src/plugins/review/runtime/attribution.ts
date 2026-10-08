import type { Commit, DiffFile, DiffLine, Hunk } from "../../../shared/types.ts";
import type { GitCapability } from "../../../runtime/tasks.ts";

/** For stacks: splits every squashed hunk where the owning commit of its changed lines changes, so each hunk holds changed lines of one commit, then renumbers hunk ids per file (`f<file>h<n>`). Line order and numbering are kept, so the whole-file rows (`fileRows`) are unchanged. Context lines stay with the run before them; leading context stays with the first run; unattributed changed lines join the current run. A hunk with one run is kept as is. No-op for single-commit diffs. */
export function splitByCommit(files: DiffFile[], commitCount: number): void {
  if (commitCount < 2) return;
  files.forEach((file, fileIndex) => {
    const out: Hunk[] = [];
    for (const hunk of file.hunks) {
      const runs: { lines: DiffLine[]; old: number; new: number }[] = [];
      let oldPos = hunk.oldLines === 0 ? hunk.oldStart + 1 : hunk.oldStart;
      let newPos = hunk.newLines === 0 ? hunk.newStart + 1 : hunk.newStart;
      let owner: number | undefined;
      let run = { lines: [] as DiffLine[], old: oldPos, new: newPos };
      for (const line of hunk.lines) {
        if (line.kind !== "ctx" && line.commit !== undefined) {
          if (owner !== undefined && line.commit !== owner) {
            runs.push(run);
            run = { lines: [], old: oldPos, new: newPos };
          }
          owner = line.commit;
        }
        run.lines.push(line);
        if (line.kind !== "add") oldPos++;
        if (line.kind !== "del") newPos++;
      }
      runs.push(run);
      if (runs.length === 1) { out.push(hunk); continue; }
      const section = hunk.header.replace(/^@@ [^@]* @@/, "");
      for (const item of runs) {
        const oldLines = item.lines.filter((line) => line.kind !== "add").length;
        const newLines = item.lines.filter((line) => line.kind !== "del").length;
        const oldStart = oldLines === 0 ? item.old - 1 : item.old;
        const newStart = newLines === 0 ? item.new - 1 : item.new;
        out.push({ id: "", header: `@@ -${oldStart},${oldLines} +${newStart},${newLines} @@${section}`, oldStart, oldLines, newStart, newLines, lines: item.lines });
      }
    }
    out.forEach((hunk, index) => { hunk.id = `f${fileIndex}h${index}`; });
    file.hunks = out;
  });
}

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
