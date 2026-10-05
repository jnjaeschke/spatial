import type { Hunk } from "../../shared/types.ts";

const URL_PATTERN = /https?:\/\/[^\s"'<>()\[\]]+#[^\s"'<>()\[\]]+/g;

/** Finds distinct anchored URLs in the enclosing source region for a hunk. */
export function specUrlsNear(headLines: string[], hunk: Hunk): string[] {
  const first = Math.max(1, hunk.newStart);
  let start = 0;
  for (let line = first - 2; line >= 0; line--) {
    if (/^\}/.test(headLines[line]!)) {
      start = line + 1;
      break;
    }
  }
  const end = Math.min(headLines.length, hunk.newStart + hunk.newLines - 1);
  const urls = new Set<string>();
  for (const line of headLines.slice(start, end)) {
    for (const match of line.matchAll(URL_PATTERN)) {
      const url = match[0].replace(/[.,;:]+$/, "");
      urls.add(url);
    }
  }
  return [...urls];
}
