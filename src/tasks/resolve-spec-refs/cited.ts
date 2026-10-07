import type { Hunk } from "../../shared/types.ts";
import { numberLines } from "../../shared/diff-lines.ts";

const URL_PATTERN = /https?:\/\/[^\s"'<>()\[\]]+#[^\s"'<>()\[\]]+/g;
const STEP_COMMENT = /^\s*(?:\/\/+|\/?\*+|#)\s*step\s+(\d+(?:\.\d+)*)\b[.:)]?\s*(.*?)\s*(?:\*\/)?$/i;
const COMMENT_LINE = /^\s*(?:\/\/+|\*+)\s*(.*?)\s*(?:\*\/)?$/;
const MAX_CONTINUATION = 3;

/** Index of the first head line of the source region enclosing a hunk: after the last column-zero `}` above it. */
function regionStart(headLines: string[], hunk: Hunk): number {
  for (let line = Math.max(1, hunk.newStart) - 2; line >= 0; line--) {
    if (/^\}/.test(headLines[line]!)) return line + 1;
  }
  return 0;
}

const urlsIn = (line: string) => [...line.matchAll(URL_PATTERN)].map((match) => match[0].replace(/[.,;:]+$/, ""));

/** Finds distinct anchored URLs in the enclosing source region for a hunk. */
export function specUrlsNear(headLines: string[], hunk: Hunk): string[] {
  const end = Math.min(headLines.length, hunk.newStart + hunk.newLines - 1);
  return [...new Set(headLines.slice(regionStart(headLines, hunk), end).flatMap(urlsIn))];
}

/** A `Step N` comment; `line` is 1-based in the head file, `url` the nearest anchored URL above it in its region. */
export interface StepComment { line: number; url: string; number: string; text: string }

/** A comment line that is neither a Step comment nor a spec link: a following "step 2 of …" line is prose, not a Step comment. */
const continuesComment = (line: string | undefined) => line !== undefined && !!COMMENT_LINE.exec(line)?.[1] && !STEP_COMMENT.test(line) && urlsIn(line).length === 0;

/** `Step N` comments on a hunk's added lines. The comment text continues on directly following comment lines until it ends a sentence, so notes after it are not part of it. */
export function stepCommentsNear(headLines: string[], hunk: Hunk): StepComment[] {
  const added = new Set(numberLines(hunk).flatMap((row) => row.kind === "add" ? [row.new!] : []));
  const end = Math.min(headLines.length, hunk.newStart + hunk.newLines - 1);
  const out: StepComment[] = [];
  let url: string | null = null;
  for (let i = regionStart(headLines, hunk); i < end; i++) {
    url = urlsIn(headLines[i]!).at(-1) ?? url;
    const step = STEP_COMMENT.exec(headLines[i]!);
    if (!step || !url || !added.has(i + 1) || continuesComment(headLines[i - 1])) continue;
    const parts = [step[2]!];
    for (let next = i + 1; next < headLines.length && next <= i + MAX_CONTINUATION && !/[.:;]$/.test(parts.at(-1)!); next++) {
      const more = COMMENT_LINE.exec(headLines[next]!);
      if (!more?.[1] || STEP_COMMENT.test(headLines[next]!) || urlsIn(headLines[next]!).length) break;
      parts.push(more[1]);
    }
    out.push({ line: i + 1, url, number: step[1]!, text: parts.filter(Boolean).join(" ") });
  }
  return out;
}
