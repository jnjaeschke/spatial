import type { ChangeStatus, Commit, DiffData, DiffFile, Hunk } from "../../../../plugin-api.ts";
import { hunkCommit } from "../../shared/review-path.ts";

const PREFIX = { ctx: " ", add: "+", del: "-" } as const;

export function renderCommits(commits: Commit[]): string {
  const label = (index: number) => (commits.length > 1 ? `C${index + 1}: ` : "");
  return commits.map((c, i) => (c.body ? `## ${label(i)}${c.subject}\n${c.body}\n` : `## ${label(i)}${c.subject}\n`)).join("\n");
}

export function renderHunk(file: DiffFile, hunk: Hunk): string {
  const label = file.status === "modified" ? "" : file.status === "renamed" ? ` (renamed from ${file.oldPath})` : ` (${file.status})`;
  return [`### ${hunk.id} ${file.path}${label}`, hunk.header, ...hunk.lines.map((l) => PREFIX[l.kind] + l.text), ""].join("\n");
}

export function renderDiffForPrompt(diff: DiffData, statuses?: Map<string, ChangeStatus>): string {
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
      const rendered = renderHunk(f, h).split("\n").slice(0, -1);
      if (diff.commits.length > 1) rendered[0] += ` [C${hunkCommit(diff, h) + 1}]`;
      const status = statuses?.get(h.id);
      if (status) rendered[0] += ` [${status}]`;
      out.push(...rendered, "");
    }
  }
  return out.join("\n");
}
