import { defineTask, type Artifact, type Id, type SessionView } from "../../../../plugin-api.ts";
import type { SpecAlgorithmData } from "../../shared/types.ts";
import { specRef } from "../../shared/refs.ts";
import { stepEffects } from "../../shared/effects.ts";

/** The session's `SpecAlgorithm` for `ref` at `sha`, if stored. */
const stored = (view: SessionView, ref: string, sha: string) => view.artifacts.find((a): a is Artifact<SpecAlgorithmData> => a.type === "SpecAlgorithm" && (a.data as SpecAlgorithmData).ref === ref && (a.data as SpecAlgorithmData).sha === sha);

/** Thrown when webspec-index has no section for the ref; `reason` is webspec-index's. */
export class SpecNotFoundError extends Error {
  readonly reason: string;
  constructor(reason: string) { super(`Spec section not found: ${reason}`); this.reason = reason; }
}

/** Looks up a section and stores it as a `SpecAlgorithm`, unless the session already has it at the same sha. */
export const loadSpecAlgorithm = defineTask<{ ref: string }, { algorithmId: Id }>({
  kind: "loadSpecAlgorithm",
  async run(ctx, { ref }) {
    const result = await ctx.webspec.query(ref, ctx.signal);
    if (!result.found) throw new SpecNotFoundError(result.reason);
    const { section } = result;
    const key = specRef(section.spec, section.anchor);
    const existing = stored(ctx.artifacts.view(), key, section.sha);
    if (existing) return { algorithmId: existing.id };
    // `query` lists only the first effects of a section; `effectPaths` has all of them with their witness paths.
    const paths = await ctx.webspec.effectPaths(key, null, ctx.signal);
    const { spec, anchor, title, type, url, content, sha, outgoingRefs, effectsStatus } = section;
    const data: SpecAlgorithmData = { ref: key, spec, anchor, title, type, url, content, sha, outgoingRefs, effectsStatus, effects: paths.effects, stepEffects: stepEffects(paths.effects, paths.explanations, section) };
    // A concurrent open of the same section may have stored it while `effectPaths` ran.
    const raced = stored(ctx.artifacts.view(), key, sha);
    if (raced) return { algorithmId: raced.id };
    return { algorithmId: ctx.artifacts.put("SpecAlgorithm", "verified", data).id };
  },
});
