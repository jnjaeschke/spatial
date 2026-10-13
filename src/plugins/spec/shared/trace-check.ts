import type { SpecHop } from "./types.ts";
import type { EngineMapping } from "./types.ts";
import type { HopResult, SpecAlgorithmData, SpecTraceEntry } from "./types.ts";
import { parseSteps, stepLinks } from "./steps.ts";
import { specRef } from "./refs.ts";
import { hopOf } from "./traces.ts";

/** What hop checks consult: loaded algorithms by ref, refs webspec-index does not know (with its reason), and the first witness path of effects by `witnessKey`. */
export interface TraceFacts { algorithms: ReadonlyMap<string, SpecAlgorithmData>; unknown: ReadonlyMap<string, string>; witnesses: ReadonlyMap<string, SpecHop[]> }

/** Key of an effect's witness path from an algorithm in `TraceFacts.witnesses`. */
export const witnessKey = (ref: string, effectId: string) => `${ref}|${effectId}`;

/** The site of `mapping` a step at `ref` likely belongs to, by stored lines: in the same file, the non-stale site with the greatest line at or before it; null when there is none or that site maps the step already. A hint for offering the step; `addMappingStep` places it at the current revision. */
export function mappingStepSite(mapping: EngineMapping, ref: { path: string; line: number }, step: string): number | null {
  let best: number | null = null;
  mapping.sites.forEach((site, index) => { if (!site.stale && site.path === ref.path && site.line <= ref.line && (best === null || site.line > mapping.sites[best]!.line)) best = index; });
  return best !== null && !mapping.sites[best]!.steps.some((s) => s.step === step) ? best : null;
}

const ASYNC_KIND = /^(scheduling|event)\./;
const inSubtree = (path: string, root: string) => path === root || path.startsWith(`${root}.`);
const OK: HopResult = { ok: true, reason: "" };
const fail = (reason: string): HopResult => ({ ok: false, reason });

/** Ids of the `scheduling.*` and `event.*` effects attributed to `step` or its sub-steps (direct or path). */
export function asyncEffectIds(algorithm: SpecAlgorithmData, step: string): string[] {
  const kinds = new Map(algorithm.effects.map((effect) => [effect.id, effect.kind]));
  const ids = new Set<string>();
  for (const [path, list] of Object.entries(algorithm.stepEffects)) if (inSubtree(path, step)) for (const item of list) {
    const kind = kinds.get(item.effectId);
    if (kind === undefined) throw new Error(`${algorithm.ref} step ${path} names effect ${item.effectId}, which it does not list`);
    if (ASYNC_KIND.test(kind)) ids.add(item.effectId);
  }
  return [...ids];
}

/** The deterministic hop check of every entry (rules in the plan's Task 4); a failure carries its reason and never removes the entry. Every anchor must be in `algorithms` or `unknown`. */
export function checkHops(entries: SpecTraceEntry[], facts: TraceFacts): HopResult[] {
  const numbers = new Map([...facts.algorithms].map(([ref, algorithm]) => [ref, parseSteps(algorithm.content).map((step) => step.number)]));
  const links = new Map([...facts.algorithms].map(([ref, algorithm]) => [ref, stepLinks(algorithm.content)]));
  const order = (entry: SpecTraceEntry) => numbers.get(entry.anchor)?.indexOf(entry.step) ?? -1;
  const exists = (entry: SpecTraceEntry) => order(entry) >= 0;
  return entries.map((entry, index) => {
    const unknown = facts.unknown.get(entry.anchor);
    if (unknown !== undefined) return fail(`${entry.anchor} is not a known spec section: ${unknown}`);
    if (!facts.algorithms.has(entry.anchor)) throw new Error(`${entry.anchor} was not loaded`);
    if (!exists(entry)) return fail(`${entry.anchor} has no step ${entry.step}`);
    const hop = hopOf(entries, index);
    if (index === 0) return hop === "start" ? OK : fail("The first entry starts the trace");
    if (hop === "start") return fail("Only the first entry starts the trace");
    const previous = entries[index - 1]!;
    if (!facts.algorithms.has(previous.anchor) || !exists(previous)) return fail(`The previous entry ${previous.anchor} step ${previous.step} is not verified`);
    const later = () => order(entry) > order(previous) ? OK : fail(`Step ${entry.step} of ${entry.anchor} is not after step ${previous.step}`);
    switch (hop) {
      case "call":
        return (links.get(previous.anchor)![previous.step] ?? []).includes(entry.anchor) ? OK : fail(`${previous.anchor} step ${previous.step} does not link ${entry.anchor}`);
      case "next":
        return entry.anchor === previous.anchor ? later() : fail(`A next hop stays in ${previous.anchor}`);
      case "return": {
        if (entry.anchor === previous.anchor) return fail(`A return leaves ${previous.anchor}; a later step of it is a next hop`);
        const left = entries.slice(0, index).findLast((earlier) => earlier.anchor === entry.anchor);
        if (!left) return fail(`${entry.anchor} is not earlier on the path`);
        return order(entry) >= order(left) ? OK : fail(`Step ${entry.step} of ${entry.anchor} is before step ${left.step}, where the walk left ${entry.anchor}`);
      }
      case "async": {
        const source = facts.algorithms.get(previous.anchor)!;
        const ids = asyncEffectIds(source, previous.step);
        if (!ids.length) return fail(`${previous.anchor} step ${previous.step} has no scheduling or event effect`);
        if (entry.anchor === previous.anchor) return later();
        const linked = Object.entries(links.get(previous.anchor)!).some(([path, refs]) => inSubtree(path, previous.step) && refs.includes(entry.anchor));
        const occurs = ids.some((id) => { const last = facts.witnesses.get(witnessKey(previous.anchor, id))?.at(-1); return last !== undefined && specRef(last.site.spec, last.site.anchor) === entry.anchor; });
        return linked || occurs ? OK : fail(`No scheduling or event effect of ${previous.anchor} step ${previous.step} reaches ${entry.anchor}`);
      }
    }
  });
}
