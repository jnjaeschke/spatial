import type { Hunk } from "../../../../plugin-api.ts";

const URL_PATTERN = /https?:\/\/[^\s"'<>()\[\]]+#[^\s"'<>()\[\]]+/g;

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
