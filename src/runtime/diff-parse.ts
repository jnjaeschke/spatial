import type { DiffFile, Hunk } from "../shared/types.ts";

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** Parses `git diff` output (no color, no external diff). */
export function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | undefined;
  let hunk: Hunk | undefined;

  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const m = /^diff --git a\/(.*) b\/(.*)$/.exec(line);
      if (!m) throw new Error(`Unparseable diff header: ${line}`);
      file = { path: m[2], status: "modified", binary: false, hunks: [] };
      files.push(file);
      hunk = undefined;
      continue;
    }
    if (!file) {
      if (line === "") continue;
      throw new Error(`Diff content before file header: ${line}`);
    }
    // Hunk content has a one-character prefix, so --- and +++ here are content.
    if (hunk) {
      const c = line[0];
      if (c === " ") { hunk.lines.push({ kind: "ctx", text: line.slice(1) }); continue; }
      if (c === "-") { hunk.lines.push({ kind: "del", text: line.slice(1) }); continue; }
      if (c === "+") { hunk.lines.push({ kind: "add", text: line.slice(1) }); continue; }
      if (c === "\\" || line === "") continue;
    }
    const h = HUNK_RE.exec(line);
    if (h) {
      hunk = {
        id: `f${files.length - 1}h${file.hunks.length}`, header: line,
        oldStart: Number(h[1]), oldLines: h[2] === undefined ? 1 : Number(h[2]),
        newStart: Number(h[3]), newLines: h[4] === undefined ? 1 : Number(h[4]), lines: [],
      };
      file.hunks.push(hunk);
    } else if (line.startsWith("new file mode")) file.status = "added";
    else if (line.startsWith("deleted file mode")) file.status = "deleted";
    else if (line.startsWith("rename from ")) {
      file.oldPath = line.slice("rename from ".length);
      file.status = "renamed";
    } else if (line.startsWith("rename to ")) file.path = line.slice("rename to ".length);
    else if (line.startsWith("Binary files ")) file.binary = true;
    // git ends these lines with a tab when the path contains a space.
    else if (line.startsWith("+++ b/")) file.path = line.slice("+++ b/".length).replace(/\t$/, "");
    else if (line.startsWith("--- a/") && file.status === "deleted") file.path = line.slice("--- a/".length).replace(/\t$/, "");
  }
  return files;
}
