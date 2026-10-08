import { type ResolvedSpec, type TaskContext, isGeckoRepo } from "../../../plugin-api.ts";
import type { SpecReferenceData } from "../shared/types.ts";

/** Result of looking up a spec URL: the resolved spec, or why it could not be resolved. */
export type SpecLookup = { found: true; spec: ResolvedSpec } | { found: false; reason: string };

/** webspec-index lookup of one URL. One failing lookup (webspec-index can crash on a single spec) is a not-found result, not an error, unless the task was cancelled. */
export function lookupSpec(env: Pick<TaskContext, "webspec" | "signal">, url: string): Promise<SpecLookup> {
  return env.webspec.resolve(url, env.signal).catch((error: Error) => {
    if (env.signal.aborted) throw error;
    return { found: false as const, reason: error.message };
  });
}

/** The `SpecReference` data of a looked-up URL; a found spec in a Gecko repo also gets the Searchfox lines that reference it. */
export async function specReferenceData(env: Pick<TaskContext, "webspec" | "searchfox" | "repo" | "signal">, url: string, result: SpecLookup, origin: "code" | "llm"): Promise<SpecReferenceData> {
  if (!result.found) return { url, resolved: null, origin, reason: result.reason, geckoRefs: [] };
  const data: SpecReferenceData = { url, resolved: result.spec, origin, geckoRefs: [] };
  if (isGeckoRepo(env.repo)) {
    try { data.geckoRefs = await env.searchfox.specRefs(result.spec.url, env.signal); }
    catch (error) {
      if (env.signal.aborted) throw error;
      data.geckoRefsError = (error as Error).message;
    }
  }
  return data;
}

/** Resolves a spec URL exactly as `resolveSpecRefs` does for a citation. */
export async function resolveSpecReference(env: Pick<TaskContext, "webspec" | "searchfox" | "repo" | "signal">, url: string, origin: "code" | "llm"): Promise<SpecReferenceData> {
  return specReferenceData(env, url, await lookupSpec(env, url), origin);
}
