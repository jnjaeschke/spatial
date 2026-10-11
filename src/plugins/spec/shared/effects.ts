import type { SpecEffect, SpecEffectPaths, SpecSite } from "../../../plugin-api.ts";
import type { StepEffect } from "./types.ts";

/**
 * The effects of an algorithm by dotted step path (ported from spec-index `web/src/effects/inline.ts`). An effect located in the algorithm
 * attaches to its own step (`direct`); one reached through other algorithms attaches to the step where a witness path leaves the
 * algorithm (`path`), which needs the explanations. Direct effects come first on a step.
 */
export function stepEffects(effects: SpecEffect[], explanations: SpecEffectPaths["explanations"] | null, subject: { spec: string; anchor: string }): Record<string, StepEffect[]> {
  const out: Record<string, StepEffect[]> = {};
  const seen = new Set<string>();
  const add = (path: number[], effectId: string, via: StepEffect["via"]) => {
    const key = path.join(".");
    if (seen.has(`${key}|${effectId}`)) return;
    seen.add(`${key}|${effectId}`);
    (out[key] ??= []).push({ effectId, via });
  };
  const isHere = (site: { spec: string; anchor: string }) => site.spec === subject.spec && site.anchor === subject.anchor;
  for (const effect of effects) for (const location of [effect.location, ...(effect.other_locations ?? [])]) if (location?.step_path && isHere(location)) add(location.step_path, effect.id, "direct");
  const known = new Set(effects.map((effect) => effect.id));
  for (const explanation of explanations ?? []) {
    if (!known.has(explanation.effectId)) continue;
    for (const hops of explanation.witnesses) {
      // Hops that stay inside the algorithm model "continue these steps"; control leaves at the call site of the last hop still inside it.
      let origin: SpecSite | undefined;
      for (const hop of hops) {
        if (isHere(hop.site) && hop.site.step_path) origin = hop.site;
        else if (isHere(hop.from) && hop.from.step_path && !origin) origin = hop.from;
        if (!isHere(hop.to)) break;
      }
      if (origin?.step_path) add(origin.step_path, explanation.effectId, "path");
    }
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.via === b.via ? 0 : a.via === "direct" ? -1 : 1);
  return out;
}
