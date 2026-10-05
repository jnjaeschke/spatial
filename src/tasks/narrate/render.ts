import type { Commit, DiffData, DiffFile, Hunk } from "../../shared/types.ts";

const PREFIX = { ctx: " ", add: "+", del: "-" } as const;

export function renderCommits(commits: Commit[]): string {
  return commits.map((c) => (c.body ? `## ${c.subject}\n${c.body}\n` : `## ${c.subject}\n`)).join("\n");
}

export function renderHunk(file: DiffFile, hunk: Hunk): string {
  const label = file.status === "modified" ? "" : file.status === "renamed" ? ` (renamed from ${file.oldPath})` : ` (${file.status})`;
  return [`### ${hunk.id} ${file.path}${label}`, hunk.header, ...hunk.lines.map((l) => PREFIX[l.kind] + l.text), ""].join("\n");
}

export function renderDiffForPrompt(diff: DiffData): string {
  const out: string[] = ["# Commits", ""];
  if (diff.commits.length) out.push(...renderCommits(diff.commits).trimEnd().split("\n"), "");
  const noHunks = diff.files.filter((f) => f.hunks.length === 0);
  if (noHunks.length) {
    out.push("# Files without hunks (context only, not to be grouped)", "");
    for (const f of noHunks) out.push(`- ${f.path} (${f.status}${f.binary ? ", binary" : ""})`);
    out.push("");
  }
  out.push("# Hunks", "");
  for (const f of diff.files) {
    for (const h of f.hunks) {
      out.push(...renderHunk(f, h).split("\n").slice(0, -1), "");
    }
  }
  return out.join("\n");
}
