import type { DiffData } from "../../shared/types.ts";

const PREFIX = { ctx: " ", add: "+", del: "-" } as const;

export function renderDiffForPrompt(diff: DiffData): string {
  const out: string[] = ["# Commits", ""];
  for (const c of diff.commits) {
    out.push(`## ${c.subject}`);
    if (c.body) out.push(c.body);
    out.push("");
  }
  const noHunks = diff.files.filter((f) => f.hunks.length === 0);
  if (noHunks.length) {
    out.push("# Files without hunks (context only, not to be grouped)", "");
    for (const f of noHunks) out.push(`- ${f.path} (${f.status}${f.binary ? ", binary" : ""})`);
    out.push("");
  }
  out.push("# Hunks", "");
  for (const f of diff.files) {
    const label = f.status === "modified" ? "" : f.status === "renamed" ? ` (renamed from ${f.oldPath})` : ` (${f.status})`;
    for (const h of f.hunks) {
      out.push(`### ${h.id} ${f.path}${label}`, h.header, ...h.lines.map((l) => PREFIX[l.kind] + l.text), "");
    }
  }
  return out.join("\n");
}
