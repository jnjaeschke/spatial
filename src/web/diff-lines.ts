import type { DiffFile, DiffLine, Hunk } from "../shared/types.ts";

export function numberLines(hunk: Hunk): { kind: DiffLine["kind"]; text: string; old?: number; new?: number }[] {
  let o = hunk.oldStart;
  let n = hunk.newStart;
  return hunk.lines.map((l) => {
    if (l.kind === "ctx") return { kind: l.kind, text: l.text, old: o++, new: n++ };
    if (l.kind === "del") return { kind: l.kind, text: l.text, old: o++ };
    return { kind: l.kind, text: l.text, new: n++ };
  });
}

export type Row = ReturnType<typeof numberLines>[number] & { hunkId?: string };

/** Whole-file diff: head lines outside hunks as context, with old numbers derived from hunk offsets. */
export function fileRows(file: DiffFile, head: string[]): Row[] {
  const rows: Row[] = [];
  let n = 1;
  let delta = 0;
  const context = (until: number) => {
    for (; n < until; n++) rows.push({ kind: "ctx", text: head[n - 1], old: n + delta, new: n });
  };
  for (const h of file.hunks) {
    context(h.newLines === 0 ? h.newStart + 1 : h.newStart);
    for (const row of numberLines(h)) rows.push({ ...row, hunkId: h.id });
    n = h.newLines === 0 ? h.newStart + 1 : h.newStart + h.newLines;
    delta = (h.oldLines === 0 ? h.oldStart + 1 : h.oldStart + h.oldLines) - n;
  }
  context(head.length + 1);
  return rows;
}
