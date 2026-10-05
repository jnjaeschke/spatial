import type { DiffLine, Hunk } from "../shared/types.ts";

export function numberLines(hunk: Hunk): { kind: DiffLine["kind"]; text: string; old?: number; new?: number }[] {
  let o = hunk.oldStart;
  let n = hunk.newStart;
  return hunk.lines.map((l) => {
    if (l.kind === "ctx") return { kind: l.kind, text: l.text, old: o++, new: n++ };
    if (l.kind === "del") return { kind: l.kind, text: l.text, old: o++ };
    return { kind: l.kind, text: l.text, new: n++ };
  });
}
