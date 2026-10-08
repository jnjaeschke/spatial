import type { BlameEntry } from "../../../runtime/tasks.ts";

/** Parses `git blame --porcelain`; `fallbackPath` is used when porcelain omits a filename. */
export function parseBlame(porcelain: string, fallbackPath = ""): BlameEntry[] {
  const entries: BlameEntry[] = [];
  const paths = new Map<string, string>();
  let header: { sha: string; origLine: number; line: number } | undefined;
  for (const row of porcelain.split("\n")) {
    const match = /^([0-9a-f]{40}) (\d+) (\d+)(?: \d+)?$/.exec(row);
    if (match) {
      header = { sha: match[1]!, origLine: Number(match[2]), line: Number(match[3]) };
      continue;
    }
    if (!header) continue;
    if (row.startsWith("filename ")) paths.set(header.sha, row.slice("filename ".length));
    if (row.startsWith("\t")) {
      entries.push({ ...header, path: paths.get(header.sha) ?? fallbackPath });
      header = undefined;
    }
  }
  return entries;
}
