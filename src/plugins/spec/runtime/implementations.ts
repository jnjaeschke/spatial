import { ENGINES, type Artifact, type Engine, type Runtime } from "../../../plugin-api.ts";
import type { EngineMapping, ImplementationsData, SpecAlgorithmData } from "../shared/types.ts";
import { parseSteps } from "../shared/steps.ts";
import { storedMapping } from "./mappings.ts";
import { comparisonView } from "./compare.ts";

/** The engine overview of an algorithm: its steps, each engine's stored mapping (null where none), and the comparison. Reads only. */
export function implementationsData(rt: Runtime, algorithm: Artifact<SpecAlgorithmData>): ImplementationsData {
  const mappings = Object.fromEntries(ENGINES.map((engine) => [engine, storedMapping(rt.knowledge, engine, algorithm.data.ref)])) as Record<Engine, EngineMapping | null>;
  return { ref: algorithm.data.ref, title: algorithm.data.title, algorithmId: algorithm.id, steps: parseSteps(algorithm.data.content), mappings, comparison: comparisonView(rt, algorithm.data.ref) };
}
