import { readFileSync } from "node:fs";
import type {  FindingVerdictData, ReviewCommentData, ReviewFindingData , PatchNarrativeData, PostedCommentData } from "../../shared/types.ts";

import {type DiffData, type Id, type LlmSelection, defineTask, loadSchema, prependRepoContext, runStructured, sessionProfile} from "../../../../plugin-api.ts";
import { numberLines } from "../../../../plugin-api.ts";
import { diffNumber } from "../../shared/diffs.ts";
import { findingStates } from "../../shared/findings.ts";
import { quotePattern } from "../../shared/reanchor.ts";

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
const SCHEMA = loadSchema(import.meta.url);
interface ReplyFinding { anchor: string; quote: string | null; category: ReviewFindingData["category"]; severity: ReviewFindingData["severity"]; title: string; body: string }
interface ReplyVerdict { finding: string; verdict: FindingVerdictData["verdict"]; reason: string }

export const review = defineTask<{ narrativeId: string; llm?: LlmSelection; recheck?: Id[] }, { findingIds: string[]; verdictIds: string[]; findingErrors: string[] }>({
  kind: "review",
  async run(ctx, { narrativeId, llm, recheck }) {
    const narrative = ctx.artifacts.get<PatchNarrativeData>(narrativeId, "PatchNarrative");
    const diff = ctx.artifacts.get<DiffData>(narrative.data.diffId, "Diff");
    const view = ctx.artifacts.view();
    const currentEpoch = diffNumber(view.artifacts, narrative.data.diffId);
    const priors = findingStates(view, narrativeId).filter((s) => s.epoch < currentEpoch);
    const priorLabels = new Map(priors.map((s, i) => [`F${i + 1}`, s]));
    const rechecked = new Set(recheck ?? []);
    for (const id of rechecked) if (!priors.some((s) => s.finding.id === id)) throw new Error(`Recheck finding ${id} is not among the prior findings`);
    const diffHunks = new Map(diff.data.files.flatMap((file) => file.hunks.map((hunk) => [hunk.id, { file, hunk }] as const)));
    const priorText = priors.flatMap((s, i) => {
      const label = `F${i + 1}`;
      const hunkId = s.anchor?.startsWith(`${diff.id}#`) ? s.anchor.slice(diff.id.length + 1) : null;
      const location = s.outdated ? "outdated" : s.lines ? `${s.lines.path}:${s.lines.start}` : hunkId && diffHunks.has(hunkId)
        ? `${diffHunks.get(hunkId)!.file.path}:${diffHunks.get(hunkId)!.hunk.newStart}` : null;
      if (location === null) throw new Error(`Prior finding ${s.finding.id} has no current location`);
      const lines = [`${label} [${s.status}] ${s.finding.data.title}`, `location: ${location}`, `decision: ${s.decision ?? "none"}`, `category/severity: ${s.finding.data.category}/${s.finding.data.severity}`, `body: ${s.finding.data.body}`];
      if (s.decision === "accepted") {
        const related = view.links.filter((link) => link.kind === "about" && link.to === s.finding.id).map((link) => link.from);
        const comment = view.artifacts.filter((a) => a.type === "ReviewComment" && related.includes(a.id) && (a.status === "verified" || a.status === "proposed")).at(-1) as { id: string; data: ReviewCommentData } | undefined;
        if (comment) {
          lines.push(`accepted comment: ${comment.data.body}`);
          const posted = view.artifacts.filter((a) => a.type === "PostedComment" && (a.data as PostedCommentData).comment === comment.id).at(-1) as { data: PostedCommentData } | undefined;
          if (posted) lines.push(`posted to D${posted.data.diff}`);
        }
      }
      if (rechecked.has(s.finding.id)) lines.push("fix requested: the round after this review tried to fix this finding; give a verdict on it");
      if (s.verdict) lines.push(`previous verdict: ${s.verdict.verdict} — ${s.verdict.reason}`);
      return lines.join("\n");
    });
    const specIds = [...new Set(view.links.filter((l) => l.kind === "supports" && l.to.startsWith(`${narrativeId}#`)).map((l) => l.from))];
    const changeStatuses = narrative.data.changes.filter((c) => c.status).map((c) => `- ${c.id}: ${c.status}`);
    const updateSections = narrative.data.previous || priors.length ? [
      ...(changeStatuses.length ? ["# Change status", ...changeStatuses] : []),
      ...(priors.length ? ["# Prior findings\n\n" + priorText.join("\n\n")] : []),
    ] : [];
    const prompt = [
      "# Session", ctx.artifacts.overview(),
      "# Changes", ...narrative.data.changes.map((c) => ctx.artifacts.render(`${narrativeId}#${c.id}`)),
      ...updateSections,
      ...(specIds.length ? ["# Spec references", ...specIds.map((id) => ctx.artifacts.render(id))] : []),
    ].join("\n\n");
    const notes = (await sessionProfile(ctx.repoProfiles, ctx.artifacts.view(), ctx.repo)).promptNotes;
    const { json, result: r } = await runStructured<{ findings: ReplyFinding[]; verdicts: ReplyVerdict[] }>(ctx.llm, { prompt, system: prependRepoContext(notes ? `${SYSTEM}\n\n${notes}` : SYSTEM, ctx), schema: SCHEMA, cwd: ctx.repo, tools: "read-only", mcpServers: ctx.mcpServers(), label: "Review reply", repairs: 1 }, llm);

    const locate = (f: ReplyFinding): Pick<ReviewFindingData, "anchor" | "quote" | "lines"> | string => {
      const change = narrative.data.changes.find((c) => c.id === f.anchor);
      const inNarrative = narrative.data.changes.some((c) => c.hunkIds.includes(f.anchor));
      if (!change && !inNarrative) return `unknown anchor ${f.anchor}`;
      if (f.quote === null) return { anchor: change ? `${narrativeId}#${change.id}` : `${diff.id}#${f.anchor}` };
      const quote = f.quote.trim();
      if (!quote) return "empty quote";
      if (/[\r\n]/.test(quote)) return "quote spans lines";
      const pattern = quotePattern(quote);
      for (const hunkId of change ? change.hunkIds : [f.anchor]) {
        const { file, hunk } = diffHunks.get(hunkId)!;
        for (const row of numberLines(hunk)) {
          if (!pattern.test(row.text)) continue;
          const side = row.kind === "del" ? "old" : "new";
          const n = side === "old" ? row.old! : row.new!;
          return { anchor: `${diff.id}#${hunkId}`, quote, lines: { path: file.path, side, start: n, end: n } };
        }
      }
      return "quote not found";
    };

    const findingIds: string[] = [], verdictIds: string[] = [], findingErrors: string[] = [];
    const expected = new Map([...priorLabels].filter(([, s]) => (s.decision === "accepted" || rechecked.has(s.finding.id)) && s.verdict?.verdict !== "addressed"));
    const seenVerdicts = new Set<string>();
    for (const v of json.verdicts) {
      const state = priorLabels.get(v.finding);
      if (!state || !expected.has(v.finding)) { findingErrors.push(`verdict ${v.finding}: unknown or not expected`); continue; }
      if (seenVerdicts.has(v.finding)) { findingErrors.push(`verdict ${v.finding}: duplicate`); continue; }
      seenVerdicts.add(v.finding);
      const artifact = ctx.artifacts.put<FindingVerdictData>("FindingVerdict", "proposed", { finding: state.finding.id, verdict: v.verdict, reason: v.reason }, r.selection);
      ctx.links.put(artifact.id, state.finding.id, "about");
      ctx.links.put(artifact.id, narrativeId, "derivedFrom");
      verdictIds.push(artifact.id);
    }
    for (const label of expected.keys()) if (!seenVerdicts.has(label)) findingErrors.push(`no verdict for ${label}`);
    for (const f of json.findings) {
      const located = locate(f);
      if (typeof located === "string") { findingErrors.push(`${f.title}: ${located}`); continue; }
      const finding = ctx.artifacts.put<ReviewFindingData>("ReviewFinding", "proposed", { ...located, category: f.category, severity: f.severity, title: f.title, body: f.body }, r.selection);
      ctx.links.put(finding.id, narrativeId, "derivedFrom");
      ctx.links.put(finding.id, located.anchor, "about");
      findingIds.push(finding.id);
    }
    return { findingIds, verdictIds, findingErrors };
  },
});
