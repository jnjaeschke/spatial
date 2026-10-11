import type { Artifact, Engine, Id, Knowledge, KnowledgeEntry, KnowledgeProvenance, Runtime } from "../../../plugin-api.ts";
import type { EngineMapping, EngineSite, SpecAlgorithmData } from "../shared/types.ts";
import { byPlace, engineMapping, mappingKey, mergeLatest, siteKey } from "../shared/engine.ts";
import type { FoundImplementation } from "../tasks/find-implementation/task.ts";

const DAY = 24 * 60 * 60 * 1000;
/** Mapping runs in flight per runtime, by `engine|ref`: the mapping is global, so a run started from any session or algorithm artifact covers it. */
const inFlight = new WeakMap<Runtime, Set<string>>();

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

/** Whether an LLM search for the algorithm in `engine` is pending or running. */
export function searchRunning(rt: Runtime, sessionId: Id, engine: Engine, algorithmId: Id): boolean {
  return rt.store.listTasks(sessionId).some((task) => {
    const input = task.input as { algorithmId?: unknown; engine?: unknown };
    return task.kind === "findImplementation" && (task.status === "pending" || task.status === "running") && input.algorithmId === algorithmId && input.engine === engine;
  });
}

/** Starts an LLM search; new sites join the mapping current when the search ends. */
export function startSearch(rt: Runtime, sessionId: Id, engine: Engine, algorithm: Artifact<SpecAlgorithmData>, stale: EngineSite | null): { taskId: Id; merged: Promise<void> } {
  const ref = algorithm.data.ref;
  const { taskId, done } = rt.start<FoundImplementation>(sessionId, "findImplementation", { algorithmId: algorithm.id, engine, stale });
  const merged = done.then((found) => {
    updateMapping(rt, sessionId, engine, ref, { by: "llm", taskId, sessionId }, (mapping) => {
      if (!mapping) throw new Error(`${ref} has no ${engine} mapping`);
      const taken = new Set([...mapping.sites.map(siteKey), ...mapping.rejected.map(siteKey)]);
      const added = found.sites.filter((site) => !taken.has(siteKey(site)));
      if (!added.length) return null;
      return { ...mapping, sites: [...mapping.sites.filter((site) => !stale || siteKey(site) !== siteKey(stale)), ...added].sort(byPlace) };
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

/** Maps an algorithm in `engine` unless its mapping is fresh (checked within a day, or older but still at the code search's revision) or a mapping of it is running; what was stored while it ran is merged into its result. */
export async function ensureMapping(rt: Runtime, sessionId: Id, engine: Engine, algorithm: Artifact<SpecAlgorithmData>, now = Date.now()): Promise<void> {
  const ref = algorithm.data.ref;
  const read = rt.knowledge.get("global", "spec", mappingKey(engine, ref));
  if (read.state === "deleted") return;
  if (read.state === "current") {
    const mapping = engineMapping(read.entry.value);
    if (now - Date.parse(mapping.checkedAt) < DAY || (await rt.codeSearch[engine].tip()).rev === mapping.rev) return;
  }
  const running = inFlight.get(rt) ?? new Set<string>();
  inFlight.set(rt, running);
  const key = `${engine}|${ref}`;
  if (running.has(key)) return;
  running.add(key);
  try {
    const before = JSON.stringify(storedMapping(rt.knowledge, engine, ref));
    const mapping = await rt.run<EngineMapping>(sessionId, "mapEngine", { algorithmId: algorithm.id, engine });
    updateMapping(rt, sessionId, engine, ref, { by: "plugin", sessionId }, (latest) => latest && JSON.stringify(latest) !== before ? mergeLatest(mapping, latest) : mapping);
  } finally {
    running.delete(key);
  }
}
