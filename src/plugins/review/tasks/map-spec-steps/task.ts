import { readFileSync } from "node:fs";
import { type Artifact, type DiffData, type Id, type LineRange, type Link, type LlmSelection, type PatchNarrativeData, type ReviewFindingData, type SpecReferenceData, type SpecStepMapData, type StepLink, type UnmappedLines, type UnmappedReason, defineTask } from "../../../../plugin-api.ts";
import { numberLines } from "../../shared/diff-lines.ts";
import { parseSteps } from "../../shared/spec-text.ts";
import { findingStates } from "../../shared/findings.ts";
import { checkStepComment, commentBlock, misplacedStepComment, stepComments } from "../resolve-spec-refs/step-check.ts";

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
const SCHEMA = JSON.parse(readFileSync(new URL("./schema.json", import.meta.url), "utf8")) as object;
const KINDS = ["implements", "partial", "structural", "deviates"];
const REASONS: UnmappedReason[] = ["plumbing", "error-path", "test", "unexplained"];
const validRanges = (ranges: unknown): ranges is LineRange[] => Array.isArray(ranges) && ranges.every((range) => typeof range?.path === "string" && (range.side === "new" || range.side === "old") && Number.isInteger(range.start) && Number.isInteger(range.end));
const isReply = (j: unknown): j is { links: StepLink[]; unmapped: UnmappedLines[] } => {
  const r = j as { links?: Partial<StepLink>[]; unmapped?: Partial<UnmappedLines>[] } | undefined;
  return Array.isArray(r?.links) && r.links.every((l) => typeof l?.step === "string" && KINDS.includes(l.kind as string) && typeof l.note === "string" && validRanges(l.ranges)) &&
    Array.isArray(r.unmapped) && r.unmapped.every((entry) => REASONS.includes(entry.reason as UnmappedReason) && typeof entry.note === "string" && validRanges(entry.ranges));
};

/** Change ids of the narrative a SpecReference supports. */
const supportedChanges = (links: Link[], specId: Id, narrativeId: Id) => links.filter((l) => l.kind === "supports" && l.from === specId && l.to.startsWith(`${narrativeId}#`)).map((l) => l.to.slice(narrativeId.length + 1));

/** The resolved SpecReferences supporting changes of a narrative whose section has numbered steps. */
export function mappableSpecs(state: { artifacts: Artifact[]; links: Link[] }, narrativeId: Id): Id[] {
  return state.artifacts.filter((a) => a.type === "SpecReference" && (a as Artifact<SpecReferenceData>).data.resolved && supportedChanges(state.links, a.id, narrativeId).length > 0 &&
    parseSteps((a as Artifact<SpecReferenceData>).data.resolved!.content).length > 0).map((a) => a.id);
}

/** Maps the steps of one spec section onto the hunks of the changes it supports (one LLM call, no tools; see `SpecStepMapData`), then reports Step comments on code the map gives to another step as proposed `ReviewFinding`s. `stepCheckErrors` lists files whose analysis failed. */
export const mapSpecSteps = defineTask<{ narrativeId: Id; specId: Id; llm?: LlmSelection }, { mapId: Id; findingIds: Id[]; stepCheckErrors: string[] }>({
  kind: "mapSpecSteps",
  async run(ctx, { narrativeId, specId, llm }) {
    const narrative = ctx.artifacts.get<PatchNarrativeData>(narrativeId);
    if (narrative.type !== "PatchNarrative") throw new Error(`Artifact ${narrativeId} is not a PatchNarrative (got ${narrative.type})`);
    const spec = ctx.artifacts.get<SpecReferenceData>(specId);
    if (spec.type !== "SpecReference" || !spec.data.resolved) throw new Error(`Artifact ${specId} is not a resolved SpecReference`);
    const diff = ctx.artifacts.get<DiffData>(narrative.data.diffId);
    const steps = parseSteps(spec.data.resolved.content);
    if (steps.length === 0) throw new Error(`${spec.data.resolved.spec}#${spec.data.resolved.anchor} has no numbered steps`);
    const changeIds = new Set(supportedChanges(ctx.artifacts.view().links, specId, narrativeId));
    const changes = narrative.data.changes.filter((c) => changeIds.has(c.id));
    if (changes.length === 0) throw new Error(`${specId} supports no change of ${narrativeId}`);
    const hunkIds = new Set(changes.flatMap((c) => c.hunkIds));

    const present = new Map<string, Set<number>>();
    const hunkText: string[] = [];
    for (const file of diff.data.files) {
      for (const hunk of file.hunks) {
        if (!hunkIds.has(hunk.id)) continue;
        hunkText.push(`### ${hunk.id} ${file.path}`, hunk.header);
        for (const row of numberLines(hunk)) {
          const side = row.kind === "del" ? "old" : "new";
          const n = side === "old" ? row.old! : row.new!;
          let lines = present.get(`${file.path}:${side}`);
          if (!lines) present.set(`${file.path}:${side}`, lines = new Set());
          lines.add(n);
          hunkText.push(row.kind === "del" ? `${String(n).padStart(5)}(old) - ${row.text}` : `${String(n).padStart(5)} ${row.kind === "add" ? "+" : " "} ${row.text}`);
        }
        hunkText.push("");
      }
    }
    const r = spec.data.resolved;
    const prompt = [
      `# Spec: ${r.spec}#${r.anchor} (${r.title})`, r.url, "",
      ...steps.map((step) => `${"  ".repeat(step.depth)}[${step.number}] ${step.text}`), "",
      "# Changes", ...changes.map((c) => `- ${c.title}: ${c.explanation}`), "",
      "# Changed hunks", "", ...hunkText,
    ].join("\n");
    const reply = await ctx.llm.run({ prompt, system: SYSTEM, schema: SCHEMA, cwd: ctx.repo, tools: "none" }, llm);
    if (!isReply(reply.json)) throw new Error(`Step mapping reply is not valid JSON: ${JSON.stringify(reply.json)}`);

    const numbers = new Set(steps.map((step) => step.number));
    const trim = (range: LineRange): LineRange | null => {
      const lines = present.get(`${range.path}:${range.side}`);
      if (!lines) return null;
      let { start, end } = range;
      while (start <= end && !lines.has(start)) start++;
      while (end >= start && !lines.has(end)) end--;
      return start > end ? null : { ...range, start, end };
    };
    const links: StepLink[] = [];
    const dropped: string[] = [];
    for (const link of reply.json.links) {
      if (!numbers.has(link.step)) { dropped.push(`step ${link.step}: not a step of the section`); continue; }
      const ranges = link.ranges.map(trim).filter((range): range is LineRange => range !== null);
      if (ranges.length < link.ranges.length) dropped.push(`step ${link.step}: ${link.ranges.length - ranges.length} range(s) outside the changes' hunks`);
      if (ranges.length === 0 && link.kind !== "structural") { dropped.push(`step ${link.step}: no lines left`); continue; }
      links.push({ step: link.step, kind: link.kind, ranges, note: link.note });
    }
    const unmapped: UnmappedLines[] = [];
    for (const entry of reply.json.unmapped) {
      const ranges = entry.ranges.map(trim).filter((range): range is LineRange => range !== null);
      if (ranges.length < entry.ranges.length) dropped.push(`unmapped ${entry.reason}: ${entry.ranges.length - ranges.length} range(s) outside the changes' hunks`);
      if (ranges.length) unmapped.push({ ranges, reason: entry.reason, note: entry.note });
    }
    const map = ctx.artifacts.put<SpecStepMapData>("SpecStepMap", "proposed", { spec: specId, narrative: narrativeId, links, unmapped, dropped }, reply.selection);
    ctx.links.put(map.id, specId, "derivedFrom");
    ctx.links.put(map.id, narrativeId, "about");
    const findingIds: Id[] = [], stepCheckErrors: string[] = [];
    const mappedByFile = new Map<string, Map<number, string>>();
    for (const file of diff.data.files) {
      if (file.status === "deleted") continue;
      const hunkByLine = new Map<number, string>();
      for (const hunk of file.hunks) {
        if (!hunkIds.has(hunk.id)) continue;
        for (const row of numberLines(hunk)) if (row.kind === "add") hunkByLine.set(row.new!, hunk.id);
      }
      if (hunkByLine.size) mappedByFile.set(file.path, hunkByLine);
    }
    const carried = new Set(findingStates(ctx.artifacts.view(), narrativeId).filter((state) => !state.outdated).map((state) => `${state.finding.data.title}\n${state.quote}`));
    const resolvedByUrl = new Map<string, Awaited<ReturnType<typeof ctx.webspec.resolve>>>();
    const resolve = async (url: string) => {
      if (!resolvedByUrl.has(url)) {
        try { resolvedByUrl.set(url, await ctx.webspec.resolve(url, ctx.signal)); }
        catch (error) { if (ctx.signal.aborted) throw error; resolvedByUrl.set(url, { found: false, reason: (error as Error).message }); }
      }
      return resolvedByUrl.get(url)!;
    };
    const current = spec.data.resolved;
    const specName = `${current.spec}#${current.anchor}`;
    for (const [path, hunkByLine] of mappedByFile) {
      const text = await ctx.git.show(diff.data.headSha, path);
      let checks;
      try { checks = await stepComments(ctx.webspec, path, text, hunkByLine.keys(), ctx.signal); }
      catch (error) { if (ctx.signal.aborted) throw error; stepCheckErrors.push(`${path}: ${(error as Error).message}`); continue; }
      const lines = text.split("\n"), commentLines = new Set(checks.map((check) => check.line));
      for (const check of checks) {
        const hunkId = hunkByLine.get(check.line);
        if (!hunkId) continue;
        const citesThis = check.url === spec.data.url || check.url === current.url || await resolve(check.url).then((result) => result.found && result.spec.url === current.url);
        if (!citesThis || checkStepComment(check, specName, steps)) continue;
        const block = commentBlock(lines, check.line, commentLines);
        const covering = links.filter((link) => link.ranges.some((range) => range.path === path && range.side === "new" && block.some((line) => line >= range.start && line <= range.end)));
        const problem = misplacedStepComment(check, specName, steps, covering);
        const quote = lines[check.line - 1]!.trim();
        if (!problem || carried.has(`${problem.title}\n${quote}`)) continue;
        const anchor = `${diff.id}#${hunkId}`;
        const finding = ctx.artifacts.put<ReviewFindingData>("ReviewFinding", "proposed", { anchor, quote, lines: { path, side: "new", start: check.line, end: check.line }, category: "spec", ...problem }, reply.selection);
        ctx.links.put(finding.id, narrativeId, "derivedFrom");
        ctx.links.put(finding.id, anchor, "about");
        findingIds.push(finding.id);
      }
    }
    return { mapId: map.id, findingIds, stepCheckErrors };
  },
});
