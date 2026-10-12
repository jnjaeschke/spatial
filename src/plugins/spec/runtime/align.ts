import type { Artifact, Engine, Id, Runtime } from "../../../plugin-api.ts";
import type { EngineStep, SpecAlgorithmData } from "../shared/types.ts";
import { siteKey } from "../shared/engine.ts";
import { updateMapping } from "./mappings.ts";

/** Alignments running per runtime, by `engine|ref`, like `startSearch`'s searches. */
const aligning = new WeakMap<Runtime, Set<string>>();

/** Whether an alignment of `ref`'s steps in `engine` is running, started from any session. */
export function alignRunning(rt: Runtime, engine: Engine, ref: string): boolean {
  return aligning.get(rt)?.has(`${engine}|${ref}`) ?? false;
}

/** Starts aligning `algorithm`'s steps with the site `key` of its `engine` mapping, one at a time per `engine|ref` (throws while one runs); `merged` replaces that site's `align` steps with the checked ranges (resolves after the write, or after logging a failure). */
export function startAlign(rt: Runtime, sessionId: Id, engine: Engine, algorithm: Artifact<SpecAlgorithmData>, key: string): { taskId: Id; merged: Promise<void> } {
  const ref = algorithm.data.ref;
  if (alignRunning(rt, engine, ref)) throw new Error(`A ${engine} alignment for ${ref} is running`);
  const { taskId, done } = rt.start<{ steps: EngineStep[]; dropped: string[] }>(sessionId, "alignSteps", { algorithmId: algorithm.id, engine, key });
  const running = aligning.get(rt) ?? new Set<string>();
  aligning.set(rt, running);
  running.add(`${engine}|${ref}`);
  const merged = done.then(({ steps }) => {
    updateMapping(rt, sessionId, engine, ref, { by: "llm", taskId, sessionId }, (mapping) => {
      if (!mapping?.sites.some((site) => siteKey(site) === key)) throw new Error(`Site ${key} left the ${engine} mapping of ${ref} while its steps were aligned`);
      return { ...mapping, sites: mapping.sites.map((site) => siteKey(site) === key ? { ...site, steps: [...site.steps.filter((step) => step.origin !== "align"), ...steps] } : site) };
    });
  }).catch((error) => console.error(`Step alignment of ${ref} in ${engine} failed: ${(error as Error).message}`)).finally(() => running.delete(`${engine}|${ref}`));
  return { taskId, merged };
}
