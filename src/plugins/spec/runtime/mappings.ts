import type { Artifact, Engine, Id, Knowledge, KnowledgeEntry, KnowledgeProvenance, Runtime } from "../../../plugin-api.ts";
import type { EngineMapping, SpecAlgorithmData } from "../shared/types.ts";
import { engineMapping, mappingKey, mergeLatest } from "../shared/engine.ts";

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
