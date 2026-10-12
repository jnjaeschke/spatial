import { createHash } from "node:crypto";
import { ENGINES, type Artifact, type Engine, type Id, type Runtime } from "../../../plugin-api.ts";
import type { ComparisonView, EngineComparison, EngineMapping, SpecAlgorithmData, StoredComparison } from "../shared/types.ts";
import { numbered, shiftSteps, siteName, usedSites } from "../shared/engine.ts";
import { parseSteps } from "../shared/steps.ts";
import { citedEvidence, comparisonErrors, type ComparedFiles } from "../shared/compare-check.ts";
import type { CompareInput } from "../tasks/compare-engines/task.ts";
import { storedMapping } from "./mappings.ts";
import { siteAtTip } from "./engine-map.ts";

/** Knowledge key of an algorithm's comparison. */
export const compareKey = (ref: string) => `compare|${ref}`;
const flagPrefix = (ref: string, entryId: string) => `compare-flag|${ref}|${entryId}|`;

/** A digest of the sites a comparison relies on; refresh metadata does not affect it. */
export const mappingDigest = (mapping: EngineMapping | null) => createHash("sha256").update(JSON.stringify(usedSites(mapping))).digest("hex");
const comparing = new WeakMap<Runtime, Set<string>>();

/** Whether a comparison of `ref` is running. */
export function compareRunning(rt: Runtime, ref: string): boolean { return comparing.get(rt)?.has(compareKey(ref)) ?? false; }

/** Prepares and starts a comparison of engines with sites (throws when a site's code is gone at the current revision); `merged` checks, verifies and stores the result. */
export async function startCompare(rt: Runtime, sessionId: Id, algorithm: Artifact<SpecAlgorithmData>): Promise<{ taskId: Id; merged: Promise<void> }> {
  const ref = algorithm.data.ref;
  const mappings = ENGINES.map((engine) => ({ engine, mapping: storedMapping(rt.knowledge, engine, ref) })).filter(({ mapping }) => usedSites(mapping).length);
  if (mappings.length < 2) throw new Error("Compare needs sites in at least two engines");
  if (compareRunning(rt, ref)) throw new Error(`A comparison of ${ref} is running`);
  const running = comparing.get(rt) ?? new Set<string>();
  comparing.set(rt, running); running.add(compareKey(ref));
  try { return await prepareCompare(rt, sessionId, algorithm, mappings, () => running.delete(compareKey(ref))); }
  catch (error) { running.delete(compareKey(ref)); throw error; }
}

async function prepareCompare(rt: Runtime, sessionId: Id, algorithm: Artifact<SpecAlgorithmData>, mappings: { engine: Engine; mapping: EngineMapping | null }[], release: () => void): Promise<{ taskId: Id; merged: Promise<void> }> {
  const ref = algorithm.data.ref, signal = new AbortController().signal;
  const files: ComparedFiles = {}, engines: CompareInput["engines"] = [];
  for (const { engine, mapping } of mappings) {
    const known = files[engine] ??= {}, sites: CompareInput["engines"][number]["sites"] = [];
    for (const site of usedSites(mapping).slice(0, 3)) {
      const found = await siteAtTip(rt.codeSearch[engine], site, signal);
      if (!found) throw new Error(`${engine} ${site.path}:${site.line} no longer reads \`${site.quote}\`; refresh the mapping`);
      const { lines, at, fn } = found;
      known[site.path] = lines;
      sites.push({ path: site.path, name: siteName(site), source: numbered(lines, at, Math.min(fn?.end ?? at, at + 199)), steps: shiftSteps(site.steps, at - site.line).map((step) => ({ step: step.step, line: step.line, end: step.end ?? step.line })) });
    }
    engines.push({ engine, sites });
  }
  const basedOn = Object.fromEntries(mappings.map(({ engine, mapping }) => [engine, mappingDigest(mapping)])) as Partial<Record<Engine, string>>;
  const { taskId, done } = rt.start<EngineComparison>(sessionId, "compareEngines", { algorithmId: algorithm.id, engines } satisfies CompareInput);
  const merged = done.then(async (comparison) => {
    const steps = parseSteps(algorithm.data.content);
    const checked = comparison.differences.filter((difference) => !comparisonErrors(difference, steps, files).length);
    let kept = checked;
    if (checked.length) {
      const verdicts = await rt.run<{ differences: { supported: boolean; reason: string }[] }>(sessionId, "verifyComparison", { algorithmId: algorithm.id, differences: checked, evidence: checked.map((difference) => citedEvidence(difference, steps, files)) });
      kept = checked.filter((_, index) => verdicts.differences[index]!.supported);
    }
    rt.knowledge.put("global", "spec", compareKey(ref), { comparison: { differences: kept }, dropped: comparison.differences.length - kept.length, basedOn } satisfies StoredComparison, { by: "llm", taskId, sessionId });
    rt.emit(sessionId, "runtime", "spec.compare", { ref });
  }).catch((error) => console.error(`Comparison of ${ref} failed: ${(error as Error).message}`)).finally(release);
  return { taskId, merged };
}

/** The stored comparison of `ref` as the overview shows it. */
export function comparisonView(rt: Runtime, ref: string): ComparisonView {
  const read = rt.knowledge.get("global", "spec", compareKey(ref));
  if (read.state !== "current") return { state: "absent" };
  const stored = read.entry.value as StoredComparison, prefix = flagPrefix(ref, read.entry.id);
  const flagged = new Set(rt.knowledge.list("global", "spec", prefix).map((entry) => Number(entry.key.slice(prefix.length))));
  const comparable = ENGINES.filter((engine) => usedSites(storedMapping(rt.knowledge, engine, ref)).length);
  const outdated = comparable.join() !== ENGINES.filter((engine) => engine in stored.basedOn).join() || comparable.some((engine) => mappingDigest(storedMapping(rt.knowledge, engine, ref)) !== stored.basedOn[engine]);
  return { state: "ready", entryId: read.entry.id, differences: stored.comparison.differences.map((difference, index) => ({ ...difference, index })).filter((difference) => !flagged.has(difference.index)), dropped: stored.dropped, flagged: flagged.size, outdated };
}

/** Flags a difference of the current comparison; throws if it changed or the index is invalid. */
export function flagDifference(rt: Runtime, sessionId: Id, ref: string, entryId: string, index: number): void {
  const read = rt.knowledge.get("global", "spec", compareKey(ref));
  if (read.state !== "current" || read.entry.id !== entryId) throw new Error("The comparison changed; reload it");
  if (!Number.isInteger(index) || index < 0 || index >= (read.entry.value as StoredComparison).comparison.differences.length) throw new RangeError(`No difference ${index}`);
  rt.knowledge.put("global", "spec", `${flagPrefix(ref, entryId)}${index}`, null, { by: "user", sessionId });
}
