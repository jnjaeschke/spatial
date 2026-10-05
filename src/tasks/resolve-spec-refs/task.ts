import type { DiffData, PatchNarrativeData, SpecReferenceData } from "../../shared/types.ts";
import { isGeckoRepo } from "../../runtime/searchfox.ts";
import { defineTask } from "../../runtime/tasks.ts";
import { specUrlsNear } from "./cited.ts";

export const resolveSpecRefs = defineTask<{ narrativeId: string }, { specRefIds: string[] }>({
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

    for (const file of diffArtifact.data.files) {
      if (file.status === "deleted" || file.hunks.length === 0) continue;
      const lines = (await ctx.git.show(diffArtifact.data.headSha, file.path)).split("\n");
      for (const hunk of file.hunks) {
        const changeIds = hunkChanges.get(hunk.id) ?? [];
        if (changeIds.length === 0) continue;
        for (const url of specUrlsNear(lines, hunk)) addCitation(url, changeIds, "code");
      }
    }
    for (const change of narrative.data.changes) {
      for (const url of change.specUrls) addCitation(url, [change.id], "llm");
    }

    const gecko = isGeckoRepo(ctx.repo);
    const groups = new Map<string, { data: SpecReferenceData; changeIds: Set<string> }>();
    let i = 0;
    for (const [url, citation] of citations) {
      const changeIds = [...citation.changeIds];
      ctx.progress({ kind: "determinate", done: i++, total: citations.size, message: url });
      const result = await ctx.webspec.resolve(url, ctx.signal);
      // Code comments link Bugzilla, MDN, GitHub etc.; only the LLM's unresolved proposals are worth an unverified card.
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
    return { specRefIds };
  },
});
