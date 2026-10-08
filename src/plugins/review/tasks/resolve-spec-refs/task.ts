import { type DiffData, type PatchNarrativeData, type ResolvedSpec, type ReviewFindingData, type SpecReferenceData, isGeckoRepo, defineTask, type StepCommentCheck } from "../../../../plugin-api.ts";
import { findingStates } from "../../shared/findings.ts";
import { parseSteps } from "../../shared/spec-text.ts";
import { numberLines } from "../../shared/diff-lines.ts";
import { specUrlsNear } from "./cited.ts";
import { checkStepComment, stepComments } from "./step-check.ts";

/** Resolves the spec URLs cited near changed code or proposed by the narrative into `SpecReference` artifacts, and reports Step comments on added lines that webspec-index finds do not match their algorithm as `ReviewFinding`s (no LLM). `stepCheckErrors` lists files whose check failed. */
export const resolveSpecRefs = defineTask<{ narrativeId: string }, { specRefIds: string[]; findingIds: string[]; stepCheckErrors: string[] }>({
  kind: "resolveSpecRefs",
  async run(ctx, { narrativeId }) {
    const narrative = ctx.artifacts.get<PatchNarrativeData>(narrativeId);
    if (narrative.type !== "PatchNarrative") throw new Error(`Artifact ${narrativeId} is not a PatchNarrative (got ${narrative.type})`);

    const diffArtifact = ctx.artifacts.get<DiffData>(narrative.data.diffId);
    if (diffArtifact.type !== "Diff") throw new Error(`Artifact ${narrative.data.diffId} is not a Diff (got ${diffArtifact.type})`);

    const hunkChanges = new Map<string, string[]>();
    for (const change of narrative.data.changes) {
      for (const hunkId of change.hunkIds) hunkChanges.set(hunkId, [...(hunkChanges.get(hunkId) ?? []), change.id]);
    }
    const citations = new Map<string, { changeIds: Set<string>; code: boolean; llm: boolean }>();
    const addCitation = (url: string, changeIds: string[], source: "code" | "llm") => {
      let citation = citations.get(url);
      if (!citation) citations.set(url, citation = { changeIds: new Set(), code: false, llm: false });
      citation[source] = true;
      for (const changeId of changeIds) citation.changeIds.add(changeId);
    };

    const stepCommentRecords: { check: StepCommentCheck; path: string; hunkId: string; quote: string }[] = [];
    const stepCheckErrors: string[] = [];
    for (const file of diffArtifact.data.files) {
      if (file.status === "deleted" || file.hunks.length === 0) continue;
      const text = await ctx.git.show(diffArtifact.data.headSha, file.path);
      const lines = text.split("\n");
      const addedIn = new Map<number, string>();
      for (const hunk of file.hunks) {
        const changeIds = hunkChanges.get(hunk.id) ?? [];
        if (changeIds.length === 0) continue;
        for (const url of specUrlsNear(lines, hunk)) addCitation(url, changeIds, "code");
        for (const row of numberLines(hunk)) if (row.kind === "add") addedIn.set(row.new!, hunk.id);
      }
      if (addedIn.size === 0) continue;
      try {
        for (const check of await stepComments(ctx.webspec, file.path, text, addedIn.keys(), ctx.signal)) {
          const hunkId = addedIn.get(check.line);
          if (hunkId) stepCommentRecords.push({ check, path: file.path, hunkId, quote: lines[check.line - 1]!.trim() });
        }
      } catch (error) {
        if (ctx.signal.aborted) throw error;
        stepCheckErrors.push(`${file.path}: ${(error as Error).message}`);
      }
    }
    for (const change of narrative.data.changes) {
      for (const url of change.specUrls) addCitation(url, [change.id], "llm");
    }

    const gecko = isGeckoRepo(ctx.repo);
    const groups = new Map<string, { data: SpecReferenceData; changeIds: Set<string> }>();
    const resolvedByUrl = new Map<string, ResolvedSpec>();
    let i = 0;
    for (const [url, citation] of citations) {
      const changeIds = [...citation.changeIds];
      ctx.progress({ kind: "determinate", done: i++, total: citations.size, message: url });
      // One failing lookup (e.g. webspec-index crashing on one spec) must not drop every other reference.
      const result = await ctx.webspec.resolve(url, ctx.signal).catch((error: Error) => {
        if (ctx.signal.aborted) throw error;
        return { found: false as const, reason: error.message };
      });
      // Code comments link Bugzilla, MDN, GitHub etc.; only the LLM's unresolved proposals are worth an unverified card.
      if (result.found) resolvedByUrl.set(url, result.spec);
      if (!result.found && !citation.llm) continue;
      const origin = citation.code ? "code" : "llm";
      const key = result.found ? result.spec.url : url;
      const existing = groups.get(key);
      if (existing) {
        for (const changeId of changeIds) existing.changeIds.add(changeId);
        if (citation.code) existing.data.origin = "code";
        continue;
      }
      const data: SpecReferenceData = result.found
        ? { url, resolved: result.spec, origin, geckoRefs: [] }
        : { url, resolved: null, origin, reason: result.reason, geckoRefs: [] };
      if (result.found && gecko) {
        try {
          data.geckoRefs = await ctx.searchfox.specRefs(result.spec.url, ctx.signal);
        } catch (error) {
          if (ctx.signal.aborted) throw error;
          data.geckoRefsError = (error as Error).message;
        }
      }
      groups.set(key, { data, changeIds: new Set(changeIds) });
    }

    const specRefIds: string[] = [];
    for (const { data, changeIds } of groups.values()) {
      const artifact = ctx.artifacts.put("SpecReference", data.resolved ? "verified" : "proposed", data);
      for (const changeId of changeIds) ctx.links.put(artifact.id, `${narrativeId}#${changeId}`, "supports");
      specRefIds.push(artifact.id);
    }

    // A re-run for a new epoch finds the same comments again; their carried findings already cover them.
    const carried = new Set(findingStates(ctx.artifacts.view(), narrativeId).filter((s) => !s.outdated).map((s) => `${s.finding.data.title}\n${s.quote}`));
    const findingIds: string[] = [];
    for (const { check, path, hunkId, quote } of stepCommentRecords) {
      if (check.result === "exact" || check.result === "fuzzy") continue;
      if (!resolvedByUrl.has(check.url)) {
        const result = await ctx.webspec.resolve(check.url, ctx.signal).catch((error: Error) => {
          if (ctx.signal.aborted) throw error;
          return { found: false as const, reason: error.message };
        });
        if (result.found) resolvedByUrl.set(check.url, result.spec);
      }
      const spec = resolvedByUrl.get(check.url);
      const steps = spec ? parseSteps(spec.content) : [];
      if (!spec || steps.length === 0) continue;
      const problem = checkStepComment(check, `${spec.spec}#${spec.anchor}`, steps);
      if (!problem || carried.has(`${problem.title}\n${quote}`)) continue;
      const anchor = `${diffArtifact.id}#${hunkId}`;
      const finding = ctx.artifacts.put<ReviewFindingData>("ReviewFinding", "verified", { anchor, quote, lines: { path, side: "new", start: check.line, end: check.line }, category: "spec", ...problem });
      ctx.links.put(finding.id, narrativeId, "derivedFrom");
      ctx.links.put(finding.id, anchor, "about");
      findingIds.push(finding.id);
    }
    return { specRefIds, findingIds, stepCheckErrors };
  },
});
