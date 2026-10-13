import { defineTask } from "../../../../plugin-api.ts";
import type { SpecHop } from "../../shared/types.ts";
import { specServices } from "../../runtime/services.ts";

/** Thrown when webspec-index explains no path to the effect. */
export class NoWitnessError extends Error {}

/** The first witness path of one effect of an algorithm. */
export const loadEffectPath = defineTask<{ ref: string; effectId: string }, { hops: SpecHop[] }>({
  kind: "loadEffectPath",
  async run(ctx, { ref, effectId }) {
    const paths = await specServices(ctx).webspec.effectPaths(ref, effectId, ctx.signal);
    const hops = paths.explanations.find((explanation) => explanation.effectId === effectId)?.witnesses[0];
    if (!hops) throw new NoWitnessError(`No witness path for effect ${effectId} of ${ref}`);
    return { hops };
  },
});
