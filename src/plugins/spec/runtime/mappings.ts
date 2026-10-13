import { BusyError, type Artifact, type Id, type Knowledge, type KnowledgeEntry, type KnowledgeProvenance, type Runtime } from "../../../plugin-api.ts";
import type { Engine } from "../shared/types.ts";
import type { EngineMapping, EngineSite, SpecAlgorithmData } from "../shared/types.ts";
import { byPlace, engineMapping, mappingKey, mergeLatest, siteKey } from "../shared/engine.ts";
import type { FoundImplementation } from "../tasks/find-implementation/task.ts";
import { specServices } from "./services.ts";

const DAY = 24 * 60 * 60 * 1000;

/** The current mapping of a `SPEC#anchor` ref in an engine, or null when there is none. */
export function storedMapping(knowledge: Pick<Knowledge, "get">, engine: Engine, ref: string): EngineMapping | null {
  const read = knowledge.get("global", "spec", mappingKey(engine, ref));
  return read.state === "current" ? engineMapping(read.entry.value) : null;
}

/** The mapping in `engine` of each algorithm of the session, null where there is none yet. */
export function storedMappings(rt: Runtime, sessionId: Id, engine: Engine): Record<string, EngineMapping | null> {
  const refs = new Set(rt.store.listArtifacts(sessionId, "SpecAlgorithm").map((a) => (a.data as SpecAlgorithmData).ref));
  return Object.fromEntries([...refs].map((ref) => [ref, storedMapping(rt.knowledge, engine, ref)]));
}

/** The one way to write a mapping: `change` runs synchronously on the latest stored mapping (null: none); a null result writes nothing. Emits `spec.mapping`. */
export function updateMapping(rt: Runtime, sessionId: Id, engine: Engine, ref: string, provenance: KnowledgeProvenance, change: (current: EngineMapping | null) => EngineMapping | null): KnowledgeEntry | null {
  const next = change(storedMapping(rt.knowledge, engine, ref));
  if (!next) return null;
  const entry = rt.knowledge.put("global", "spec", mappingKey(engine, ref), next, provenance);
  rt.emit(sessionId, provenance.by === "user" ? "user" : "runtime", "spec.mapping", { ref, engine });
  return entry;
}

/** The ref of the algorithm a task input (`{ algorithmId }`) names. */
export const inputRef = (rt: Runtime, input: unknown) => rt.store.getArtifact<SpecAlgorithmData>((input as { algorithmId: Id }).algorithmId).data.ref;

/** Matches the input of a task of `ref` in `engine` (`{ algorithmId, engine }`) from any session: mappings are global, so one such task covers every session and artifact of the algorithm. */
export const ofEngineRef = (rt: Runtime, engine: Engine, ref: string) => (input: unknown) => (input as { engine: Engine }).engine === engine && inputRef(rt, input) === ref;

/** Starts an LLM search, one at a time per engine and ref (`BusyError` while one runs); the stale site it replaces goes and new sites join the mapping current when the search ends. */
export function startSearch(rt: Runtime, sessionId: Id, engine: Engine, algorithm: Artifact<SpecAlgorithmData>, stale: EngineSite | null): { taskId: Id; merged: Promise<void> } {
  const ref = algorithm.data.ref;
  if (rt.activeTask("findImplementation", ofEngineRef(rt, engine, ref))) throw new BusyError(`A ${engine} search for ${ref} is running`);
  const { taskId, done } = rt.start<FoundImplementation>(sessionId, "findImplementation", { algorithmId: algorithm.id, engine, stale });
  const merged = done.then((found) => {
    updateMapping(rt, sessionId, engine, ref, { by: "llm", taskId, sessionId }, (mapping) => {
      if (!mapping) throw new Error(`${ref} has no ${engine} mapping`);
      const live = mapping.sites.filter((site) => !(stale && site.stale && siteKey(site) === siteKey(stale)));
      const taken = new Set([...live.filter((site) => !site.stale).map(siteKey), ...mapping.rejected.map(siteKey)]);
      const added = found.sites.filter((site) => !taken.has(siteKey(site)));
      if (!added.length) return null;
      return { ...mapping, sites: [...live, ...added].sort(byPlace) };
    });
  }).catch((error) => console.error(`${engine} search for ${ref} failed: ${(error as Error).message}`));
  return { taskId, merged };
}

/** Confirms a proposal as a user site or rejects it; null when no proposal matches. */
export function decideProposal(rt: Runtime, sessionId: Id, engine: Engine, ref: string, key: string, decision: "confirm" | "reject"): KnowledgeEntry | null {
  return updateMapping(rt, sessionId, engine, ref, { by: "user", sessionId }, (mapping) => {
    const proposal = mapping?.sites.find((site) => site.method === "llm" && siteKey(site) === key);
    if (!mapping || !proposal) return null;
    return decision === "confirm"
      ? { ...mapping, sites: mapping.sites.map((site) => site === proposal ? { ...site, method: "user" } : site) }
      : { ...mapping, sites: mapping.sites.filter((site) => site !== proposal), rejected: [...mapping.rejected, { path: proposal.path, line: proposal.line, symbol: proposal.symbol, signature: proposal.signature }] };
  });
}

/** Maps an algorithm in `engine` unless its mapping is fresh (checked within a day, or older but still at the revision of a pinned code search) or a mapping of it is running in any session; what was stored while it ran is merged into its result. */
export async function ensureMapping(rt: Runtime, sessionId: Id, engine: Engine, algorithm: Artifact<SpecAlgorithmData>, now = Date.now()): Promise<void> {
  const ref = algorithm.data.ref;
  const read = rt.knowledge.get("global", "spec", mappingKey(engine, ref));
  if (read.state === "deleted") return;
  if (read.state === "current") {
    const mapping = engineMapping(read.entry.value);
    if (now - Date.parse(mapping.checkedAt) < DAY || (specServices(rt).codeSearch[engine].pinned && (await specServices(rt).codeSearch[engine].tip()).rev === mapping.rev)) return;
  }
  if (rt.activeTask("mapEngine", ofEngineRef(rt, engine, ref))) return;
  const before = JSON.stringify(storedMapping(rt.knowledge, engine, ref));
  const mapping = await rt.run<EngineMapping>(sessionId, "mapEngine", { algorithmId: algorithm.id, engine });
  updateMapping(rt, sessionId, engine, ref, { by: "plugin", sessionId }, (latest) => latest && JSON.stringify(latest) !== before ? mergeLatest(mapping, latest) : mapping);
}
