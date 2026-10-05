import type { PatchNarrativeData, SpecReferenceData } from "../../shared/types.ts";
import { isGeckoRepo } from "../../runtime/searchfox.ts";
import { defineTask } from "../../runtime/tasks.ts";

export const resolveSpecRefs = defineTask<{ narrativeId: string }, { specRefIds: string[] }>({
  kind: "resolveSpecRefs",
  async run(ctx, { narrativeId }) {
    const narrative = ctx.artifacts.get<PatchNarrativeData>(narrativeId);
    if (narrative.type !== "PatchNarrative") throw new Error(`Artifact ${narrativeId} is not a PatchNarrative (got ${narrative.type})`);

    const cited = new Map<string, string[]>();
    for (const c of narrative.data.changes) for (const url of c.specUrls) cited.set(url, [...(cited.get(url) ?? []), c.id]);

    const gecko = isGeckoRepo(ctx.repo);
    const groups = new Map<string, { data: SpecReferenceData; changeIds: Set<string> }>();
    let i = 0;
    for (const [url, changeIds] of cited) {
      ctx.progress({ kind: "determinate", done: i++, total: cited.size, message: url });
      const result = await ctx.webspec.resolve(url, ctx.signal);
      const key = result.found ? result.spec.url : url;
      const existing = groups.get(key);
      if (existing) {
        for (const changeId of changeIds) existing.changeIds.add(changeId);
        continue;
      }
      const data: SpecReferenceData = result.found
        ? { url, resolved: result.spec, geckoRefs: [] }
        : { url, resolved: null, reason: result.reason, geckoRefs: [] };
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
