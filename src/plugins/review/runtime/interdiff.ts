import type { DiffData, DiffFile } from "../../../shared/types.ts";
import { parseUnifiedDiff } from "./diff-parse.ts";
import type { GitCapability } from "../../../runtime/tasks.ts";

/** What the author changed between two revisions of the same patch. */
export async function computeInterdiff(git: GitCapability, from: DiffData, to: DiffData): Promise<{ files: DiffFile[]; conflicts: string[] }> {
  let files: DiffFile[];
  let conflicts: string[];
  if (from.baseSha === to.baseSha) {
    files = parseUnifiedDiff(await git.diff(from.headSha, to.headSha));
    conflicts = [];
  } else {
    const replay = await git.replay(from.baseSha, to.baseSha, from.headSha);
    conflicts = replay.conflicts;
    files = parseUnifiedDiff(await git.diff(replay.tree, to.headSha)).filter((file) => !conflicts.includes(file.path));
    for (const path of conflicts) {
      const oldFile = from.files.find((file) => file.path === path);
      const newFile = to.files.find((file) => file.path === path);
      if (!newFile) continue;
      if (oldFile && changeLines(oldFile) === changeLines(newFile)) continue;
      files.push(structuredClone(newFile));
    }
  }
  files.forEach((file, fileIndex) => file.hunks.forEach((hunk, hunkIndex) => { hunk.id = `f${fileIndex}h${hunkIndex}`; }));
  return { files, conflicts };
}

function changeLines(file: DiffFile): string {
  return file.hunks.flatMap((hunk) => hunk.lines.filter((line) => line.kind !== "ctx").map((line) => (line.kind === "add" ? "+" : "-") + line.text)).join("\n");
}
