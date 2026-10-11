import { defineTask, type Artifact, type Id } from "../../../../plugin-api.ts";
import type { SpecAlgorithmData } from "../../shared/types.ts";
import { specRef } from "../../shared/refs.ts";
import { stepEffects } from "../../shared/effects.ts";

/** Looks up a section and stores it as a `SpecAlgorithm`, unless the session already has it at the same sha. */
export const loadSpecAlgorithm = defineTask<{ ref: string }, { algorithmId: Id }>({
  kind: "loadSpecAlgorithm",
  async run(ctx, { ref }) {
    const result = await ctx.webspec.query(ref, ctx.signal);
    if (!result.found) throw new Error(`Spec section not found: ${result.reason}`);
    const { section } = result;
    const key = specRef(section.spec, section.anchor);
    const existing = ctx.artifacts.view().artifacts.find((a): a is Artifact<SpecAlgorithmData> => a.type === "SpecAlgorithm" && (a.data as SpecAlgorithmData).ref === key && (a.data as SpecAlgorithmData).sha === section.sha);
    if (existing) return { algorithmId: existing.id };
    // `query` lists only the first effects of a section; `effectPaths` has all of them with their witness paths.
    const paths = await ctx.webspec.effectPaths(key, null, ctx.signal);
    const { spec, anchor, title, type, url, content, sha, outgoingRefs, effectsStatus } = section;
    const data: SpecAlgorithmData = { ref: key, spec, anchor, title, type, url, content, sha, outgoingRefs, effectsStatus, effects: paths.effects, stepEffects: stepEffects(paths.effects, paths.explanations, section) };
    return { algorithmId: ctx.artifacts.put("SpecAlgorithm", "verified", data).id };
  },
});
