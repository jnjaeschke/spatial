import type { DiffData } from "../../shared/types.ts";
import { parseUnifiedDiff } from "../../runtime/diff-parse.ts";
import { defineTask } from "../../runtime/tasks.ts";
import { isGeckoRepo } from "../../runtime/searchfox.ts";
import { attribute } from "../../runtime/attribution.ts";

export const importDiff = defineTask<{ base: string; head: string }, { diffId: string }>({
  kind: "importDiff",
  async run(ctx, { base, head }) {
    const baseSha = await ctx.git.resolve(base);
    const headSha = await ctx.git.resolve(head);
    if (!(await ctx.git.isAncestor(baseSha, headSha))) {
      throw new Error(`Base ${base} (${baseSha.slice(0, 12)}) is not an ancestor of head ${head} (${headSha.slice(0, 12)})`);
    }
    const files = parseUnifiedDiff(await ctx.git.diff(baseSha, headSha));
    if (files.length === 0) throw new Error(`Empty diff between ${base} and ${head}`);
    const commits = await ctx.git.log(baseSha, headSha);
    await attribute(ctx.git, baseSha, headSha, commits, files);
    const data: DiffData = { baseSha, headSha, commits, files };
    if (isGeckoRepo(ctx.repo)) {
      const rev = await ctx.git.mergeBase(baseSha, "main");
      if (rev) data.upstreamRev = rev;
    }
    return { diffId: ctx.artifacts.put("Diff", "verified", data).id };
  },
});
