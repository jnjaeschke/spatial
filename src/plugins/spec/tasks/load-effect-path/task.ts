import { defineTask, type SpecHop } from "../../../../plugin-api.ts";

/** The first witness path of one effect of an algorithm. */
export const loadEffectPath = defineTask<{ ref: string; effectId: string }, { hops: SpecHop[] }>({
  kind: "loadEffectPath",
  async run(ctx, { ref, effectId }) {
    const paths = await ctx.webspec.effectPaths(ref, effectId, ctx.signal);
    const hops = paths.explanations.find((explanation) => explanation.effectId === effectId)?.witnesses[0];
    if (!hops) throw new Error(`No witness path for effect ${effectId} of ${ref}`);
    return { hops };
  },
});
