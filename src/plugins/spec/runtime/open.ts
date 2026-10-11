import { putUserArtifact, type Artifact, type Id, type Runtime } from "../../../plugin-api.ts";
import type { SpecAlgorithmData, SpecOpenedData } from "../shared/types.ts";
import { ensureSummary } from "./summaries.ts";

/** Loads `ref` (a `SPEC#anchor` or spec URL) and stores a `SpecOpened` for it; rejects when webspec-index has no such section. */
export async function openSpec(rt: Runtime, sessionId: Id, ref: string, from: SpecOpenedData["from"]): Promise<{ opened: Artifact<SpecOpenedData>; algorithm: Artifact<SpecAlgorithmData> }> {
  const { algorithmId } = await rt.run<{ algorithmId: Id }>(sessionId, "loadSpecAlgorithm", { ref });
  const algorithm = rt.store.getArtifact<SpecAlgorithmData>(algorithmId);
  const opened = putUserArtifact(rt, sessionId, "SpecOpened", { anchor: algorithm.data.ref, from } satisfies SpecOpenedData, algorithmId) as Artifact<SpecOpenedData>;
  void ensureSummary(rt, sessionId, algorithm).catch((error) => console.error(`summary of ${algorithm.data.ref} failed: ${(error as Error).message}`));
  return { opened, algorithm };
}
