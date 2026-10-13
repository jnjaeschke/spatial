import { BusyError, type Artifact, type Id, type Runtime } from "../../../plugin-api.ts";
import type { Engine } from "../shared/types.ts";
import type { EngineStep, SpecAlgorithmData } from "../shared/types.ts";
import { siteKey } from "../shared/engine.ts";
import { ofEngineRef, updateMapping } from "./mappings.ts";

/** Starts aligning `algorithm`'s steps with the site `key` of its `engine` mapping, one at a time per engine and ref (`BusyError` while one runs); `merged` replaces that site's `align` steps with the checked ranges (resolves after the write, or after logging a failure). */
export function startAlign(rt: Runtime, sessionId: Id, engine: Engine, algorithm: Artifact<SpecAlgorithmData>, key: string): { taskId: Id; merged: Promise<void> } {
  const ref = algorithm.data.ref;
  if (rt.activeTask("alignSteps", ofEngineRef(rt, engine, ref))) throw new BusyError(`A ${engine} alignment for ${ref} is running`);
  const { taskId, done } = rt.start<{ steps: EngineStep[]; dropped: string[] }>(sessionId, "alignSteps", { algorithmId: algorithm.id, engine, key });
  const merged = done.then(({ steps }) => {
    updateMapping(rt, sessionId, engine, ref, { by: "llm", taskId, sessionId }, (mapping) => {
      if (!mapping?.sites.some((site) => siteKey(site) === key)) throw new Error(`Site ${key} left the ${engine} mapping of ${ref} while its steps were aligned`);
      return { ...mapping, sites: mapping.sites.map((site) => siteKey(site) === key ? { ...site, steps: [...site.steps.filter((step) => step.origin !== "align"), ...steps] } : site) };
    });
  }).catch((error) => console.error(`Step alignment of ${ref} in ${engine} failed: ${(error as Error).message}`));
  return { taskId, merged };
}
