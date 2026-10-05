import { readFileSync } from "node:fs";
import type { DiffData, LlmSelection, PatchNarrativeData, ReviewFindingData } from "../../shared/types.ts";
import { defineTask } from "../../runtime/tasks.ts";
import { renderRef, sessionOverview } from "../../runtime/render-ref.ts";
import { numberLines } from "../../shared/diff-lines.ts";

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
const SCHEMA = JSON.parse(readFileSync(new URL("./schema.json", import.meta.url), "utf8")) as object;
const CATEGORIES = ["correctness", "spec", "tests", "style"];
const SEVERITIES = ["high", "medium", "low"];
interface ReplyFinding { anchor: string; quote: string | null; category: ReviewFindingData["category"]; severity: ReviewFindingData["severity"]; title: string; body: string }
const isReply = (j: unknown): j is { findings: ReplyFinding[] } => {
  const r = j as { findings?: Partial<ReplyFinding>[] } | undefined;
  return Array.isArray(r?.findings) && r.findings.every((f) => typeof f?.anchor === "string" && (f.quote === null || typeof f.quote === "string") &&
    CATEGORIES.includes(f.category as string) && SEVERITIES.includes(f.severity as string) && typeof f.title === "string" && typeof f.body === "string");
};
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const review = defineTask<{ narrativeId: string; llm?: LlmSelection }, { findingIds: string[]; findingErrors: string[] }>({
  kind: "review",
  async run(ctx, { narrativeId, llm }) {
    const narrative = ctx.artifacts.get<PatchNarrativeData>(narrativeId);
    if (narrative.type !== "PatchNarrative") throw new Error(`Artifact ${narrativeId} is not a PatchNarrative (got ${narrative.type})`);
    const diff = ctx.artifacts.get<DiffData>(narrative.data.diffId);
    if (diff.type !== "Diff") throw new Error(`Artifact ${narrative.data.diffId} is not a Diff (got ${diff.type})`);
    const view = ctx.artifacts.view();
    const specIds = [...new Set(view.links.filter((l) => l.kind === "supports" && l.to.startsWith(`${narrativeId}#`)).map((l) => l.from))];
    const prompt = [
      "# Session", sessionOverview(view),
      "# Changes", ...narrative.data.changes.map((c) => renderRef(view, `${narrativeId}#${c.id}`)),
      ...(specIds.length ? ["# Spec references", ...specIds.map((id) => renderRef(view, id))] : []),
    ].join("\n\n");
    const r = await ctx.llm.run({ prompt, system: SYSTEM, schema: SCHEMA, cwd: ctx.repo, tools: "read-only", mcpServers: ctx.sessionMcp }, llm);
    if (!isReply(r.json)) throw new Error(`Review reply is not valid JSON: ${JSON.stringify(r.json)}`);

    const hunks = new Map(diff.data.files.flatMap((file) => file.hunks.map((hunk) => [hunk.id, { file, hunk }] as const)));
    const locate = (f: ReplyFinding): Pick<ReviewFindingData, "anchor" | "quote" | "lines"> | string => {
      const change = narrative.data.changes.find((c) => c.id === f.anchor);
      const inNarrative = narrative.data.changes.some((c) => c.hunkIds.includes(f.anchor));
      if (!change && !inNarrative) return `unknown anchor ${f.anchor}`;
      if (f.quote === null) return { anchor: change ? `${narrativeId}#${change.id}` : `${diff.id}#${f.anchor}` };
      const quote = f.quote.trim();
      if (!quote) return "empty quote";
      if (/[\r\n]/.test(quote)) return "quote spans lines";
      const pattern = new RegExp(quote.split(/\s+/).map(escape).join("\\s+"));
      for (const hunkId of change ? change.hunkIds : [f.anchor]) {
        const { file, hunk } = hunks.get(hunkId)!;
        for (const row of numberLines(hunk)) {
          if (!pattern.test(row.text)) continue;
          const side = row.kind === "del" ? "old" : "new";
          const n = side === "old" ? row.old! : row.new!;
          return { anchor: `${diff.id}#${hunkId}`, quote, lines: { path: file.path, side, start: n, end: n } };
        }
      }
      return "quote not found";
    };

    const findingIds: string[] = [], findingErrors: string[] = [];
    for (const f of r.json.findings) {
      const located = locate(f);
      if (typeof located === "string") { findingErrors.push(`${f.title}: ${located}`); continue; }
      const finding = ctx.artifacts.put<ReviewFindingData>("ReviewFinding", "proposed", { ...located, category: f.category, severity: f.severity, title: f.title, body: f.body }, r.selection);
      ctx.links.put(finding.id, narrativeId, "derivedFrom");
      ctx.links.put(finding.id, located.anchor, "about");
      findingIds.push(finding.id);
    }
    return { findingIds, findingErrors };
  },
});
