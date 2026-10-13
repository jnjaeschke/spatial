import { createHash } from "node:crypto";
import { BusyError, type Artifact, type Id, type Runtime } from "../../../plugin-api.ts";
import { ENGINES } from "../shared/engines.ts";
import type { ComparisonView, EngineMapping, SpecAlgorithmData, StoredComparison } from "../shared/types.ts";
import { usedSites } from "../shared/engine.ts";
import { inputRef, storedMapping } from "./mappings.ts";

/** Knowledge key of an algorithm's comparison. */
export const compareKey = (ref: string) => `compare|${ref}`;
const flagPrefix = (ref: string, entryId: string) => `compare-flag|${ref}|${entryId}|`;

/** A digest of the sites a comparison relies on; refresh metadata does not affect it. */
export const mappingDigest = (mapping: EngineMapping | null) => createHash("sha256").update(JSON.stringify(usedSites(mapping))).digest("hex");

/** Starts comparing the engines with sites as one `compareAlgorithm` task, one at a time per ref in any session (`BusyError` while one runs; throws when fewer than two engines have sites); `merged` stores its result (resolves after the write, or after logging a failure). */
export function startCompare(rt: Runtime, sessionId: Id, algorithm: Artifact<SpecAlgorithmData>): { taskId: Id; merged: Promise<void> } {
  const ref = algorithm.data.ref;
  const engines = ENGINES.filter((engine) => usedSites(storedMapping(rt.knowledge, engine, ref)).length);
  if (engines.length < 2) throw new Error("Compare needs sites in at least two engines");
  if (rt.activeTask("compareAlgorithm", (input) => inputRef(rt, input) === ref)) throw new BusyError(`A comparison of ${ref} is running`);
  const { taskId, done } = rt.start<StoredComparison>(sessionId, "compareAlgorithm", { algorithmId: algorithm.id, engines });
  const merged = done.then((stored) => {
    rt.knowledge.put("global", "spec", compareKey(ref), stored, { by: "llm", taskId, sessionId });
    rt.emit(sessionId, "runtime", "spec.compare", { ref });
  }).catch((error) => console.error(`Comparison of ${ref} failed: ${(error as Error).message}`));
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
