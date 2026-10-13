import type { BlameEntry } from "./tasks.ts";

export interface BlameLine extends BlameEntry { author: string; /** Unix seconds. */ authorTime: number; text: string }

/** Parses `git blame --porcelain` or `--line-porcelain` into one entry per line; `fallbackPath` is used when the output omits a filename. */
export function parseBlameLines(porcelain: string, fallbackPath = ""): BlameLine[] {
  const entries: BlameLine[] = [];
  const paths = new Map<string, string>();
  const authors = new Map<string, { author: string; authorTime: number }>();
  let header: { sha: string; origLine: number; line: number } | undefined;
  for (const row of porcelain.split("\n")) {
    const match = /^([0-9a-f]{40}) (\d+) (\d+)(?: \d+)?$/.exec(row);
    if (match) {
      header = { sha: match[1]!, origLine: Number(match[2]), line: Number(match[3]) };
      continue;
    }
    if (!header) continue;
    const info = authors.get(header.sha) ?? { author: "", authorTime: 0 };
    if (row.startsWith("filename ")) paths.set(header.sha, row.slice("filename ".length));
    else if (row.startsWith("author ")) authors.set(header.sha, { ...info, author: row.slice("author ".length) });
    else if (row.startsWith("author-time ")) authors.set(header.sha, { ...info, authorTime: Number(row.slice("author-time ".length)) });
    else if (row.startsWith("\t")) {
      entries.push({ ...header, path: paths.get(header.sha) ?? fallbackPath, ...info, text: row.slice(1) });
      header = undefined;
    }
  }
  return entries;
}

/** Parses `git blame --porcelain`; `fallbackPath` is used when porcelain omits a filename. */
export function parseBlame(porcelain: string, fallbackPath = ""): BlameEntry[] {
  return parseBlameLines(porcelain, fallbackPath).map(({ sha, origLine, line, path }) => ({ sha, origLine, line, path }));
}
