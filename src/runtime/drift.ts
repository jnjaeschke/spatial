type FileChanges = { path: string; lines: string[] };

/**
 * Reduces a unified diff to its changed lines, each keyed by its line number (old side for `-`, new side for `+`).
 * Context lines only advance the counters, so diffs with different context sizes (Phabricator stores full-file
 * context) compare equal, while a change that moved would shift inline comment positions and does not.
 */
function changedLines(diff: string): FileChanges[] {
  const files: FileChanges[] = [];
  let current: FileChanges | undefined;
  let inHunk = false;
  let oldLine = 0;
  let newLine = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const match = /^diff --git a\/.* b\/(.*)$/.exec(line);
      current = { path: match?.[1] ?? line, lines: [] };
      files.push(current);
      inHunk = false;
      continue;
    }
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (current && hunk) {
      inHunk = true;
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
    } else if (!current || !inHunk) {
      continue;
    } else if (line.startsWith("-")) {
      current.lines.push(`-${oldLine++}:${line.slice(1)}`);
    } else if (line.startsWith("+")) {
      current.lines.push(`+${newLine++}:${line.slice(1)}`);
    } else if (line.startsWith(" ")) {
      oldLine++;
      newLine++;
    }
  }
  return files;
}

/** Returns the first file whose changed lines or their positions differ, or null when the patches agree. */
export function checkDrift(local: string, remote: string): string | null {
  const a = changedLines(local);
  const b = changedLines(remote);
  const paths = [...new Set([...a.map((file) => file.path), ...b.map((file) => file.path)])].sort();
  for (const path of paths) {
    const left = a.filter((file) => file.path === path).flatMap((file) => file.lines);
    const right = b.filter((file) => file.path === path).flatMap((file) => file.lines);
    if (left.length !== right.length || left.some((line, index) => line !== right[index])) return path;
  }
  return null;
}
