import type { DiffFile, Hunk } from "../../shared/types.ts";
import { numberLines, type Row } from "../../shared/diff-lines.ts";

/** Unchanged lines not shown: `at` is the index in `rows` they come before (rows.length: after the last row); `count` null when unknown (the end of a file not loaded). */
export interface Gap { id: number; at: number; count: number | null }

/** The rows of `file` to show: its hunks, plus the unchanged lines of the gaps in `open` once the file's lines are loaded. Gap `i` comes before hunk `i`; gap `hunks.length` follows the last hunk. Mirrors `fileRows`' numbering. */
export function visibleRows(file: DiffFile, lines: string[] | null, open: ReadonlySet<number>): { rows: Row[]; gaps: Gap[] } {
  const hunkRows = (hunk: Hunk): Row[] => numberLines(hunk).map((row) => ({ ...row, hunkId: hunk.id }));
  if (file.status !== "modified" && file.status !== "renamed") return { rows: file.hunks.flatMap(hunkRows), gaps: [] };
  const rows: Row[] = [];
  const gaps: Gap[] = [];
  let n = 1;
  let delta = 0;
  const gap = (id: number, until: number | null) => {
    if (until !== null && until <= n) return;
    if (lines && open.has(id)) for (const end = until ?? lines.length + 1; n < end; n++) rows.push({ kind: "ctx", text: lines[n - 1]!, old: n + delta, new: n });
    else gaps.push({ id, at: rows.length, count: until === null ? null : until - n });
  };
  file.hunks.forEach((hunk, index) => {
    gap(index, hunk.newLines === 0 ? hunk.newStart + 1 : hunk.newStart);
    rows.push(...hunkRows(hunk));
    n = hunk.newLines === 0 ? hunk.newStart + 1 : hunk.newStart + hunk.newLines;
    delta = (hunk.oldLines === 0 ? hunk.oldStart + 1 : hunk.oldStart + hunk.oldLines) - n;
  });
  gap(file.hunks.length, lines ? lines.length + 1 : null);
  return { rows, gaps };
}
