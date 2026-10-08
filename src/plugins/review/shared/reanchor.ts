import { numberLines } from "./diff-lines.ts";
import type { ChatThreadData, DiffData, Hunk } from "../../../shared/types.ts";

type Lines = NonNullable<ChatThreadData["lines"]>;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whitespace-flexible literal match used for finding quotes. */
export function quotePattern(quote: string): RegExp {
  return new RegExp(quote.split(/\s+/).map(escape).join("\\s+"));
}

/** Finds where a finding's code is in `next`. */
export function reanchorFinding(
  input: { quote?: string; lines?: Lines; oldHunks: { path: string; hunk: Hunk }[] },
  next: DiffData,
): { hunkId: string; lines?: Lines } | null {
  if (input.quote && input.lines) {
    const quote = input.quote.trim();
    if (!quote) return null;
    const pattern = quotePattern(quote);
    let best: { hunkId: string; lines: Lines; distance: number } | null = null;
    for (const file of next.files) {
      if (file.path !== input.lines.path && file.oldPath !== input.lines.path) continue;
      for (const hunk of file.hunks) {
        for (const row of numberLines(hunk)) {
          const side = row.kind === "del" ? "old" : "new";
          if (side !== input.lines.side || !pattern.test(row.text)) continue;
          const line = side === "old" ? row.old! : row.new!;
          const distance = Math.abs(line - input.lines.start);
          if (!best || distance < best.distance) best = { hunkId: hunk.id, lines: { path: file.path, side, start: line, end: line }, distance };
        }
      }
    }
    return best ? { hunkId: best.hunkId, lines: best.lines } : null;
  }
  if (input.quote) return null;

  const signature = (hunk: Hunk) => hunk.lines.filter((line) => line.kind !== "ctx").map((line) => `${line.kind === "add" ? "+" : "-"}${line.text}`).join("\n");
  for (const old of input.oldHunks) {
    const oldSignature = signature(old.hunk);
    for (const file of next.files) {
      if (file.path !== old.path && file.oldPath !== old.path) continue;
      const match = file.hunks.find((hunk) => signature(hunk) === oldSignature);
      if (match) return { hunkId: match.id };
    }
  }
  return null;
}
