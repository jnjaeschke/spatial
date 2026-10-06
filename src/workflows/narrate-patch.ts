import type { Id, LlmSelection } from "../shared/types.ts";
import type { Runtime } from "../runtime/tasks.ts";
import { diffsOf, epochNumber, interdiffOf, narrativeOf } from "../shared/epochs.ts";

/** importDiff → narrate → resolveSpecRefs → review. Plain orchestration; no workflow engine. */
export async function narratePatch(
  rt: Runtime,
  sessionId: Id,
  opts: { base: string; head: string; llm?: LlmSelection } | { diffId: Id; llm?: LlmSelection },
): Promise<{ diffId: Id; narrativeId: Id }> {
  const { diffId } = "diffId" in opts ? opts : await rt.run<{ diffId: Id }>(sessionId, "importDiff", { base: opts.base, head: opts.head });
  const artifacts = rt.store.listArtifacts(sessionId);
  const links = rt.store.listLinks(sessionId);
  const epoch = epochNumber(artifacts, diffId);
  const diffs = diffsOf(artifacts);
  const previous = epoch >= 2 ? narrativeOf(artifacts, diffs[epoch - 2]!.id) : null;
  const interdiff = epoch >= 2 ? interdiffOf(artifacts, links, diffId) : null;
  const update = previous && interdiff ? { previousNarrativeId: previous.id, interdiffId: interdiff.id } : undefined;
  const { narrativeId } = await rt.run<{ narrativeId: Id }>(sessionId, "narrate", { diffId, llm: opts.llm, ...(update ? { update } : {}) });
  if (epoch >= 2) await rt.run(sessionId, "carryFindings", { narrativeId });
  await rt.run(sessionId, "resolveSpecRefs", { narrativeId });
  await rt.run(sessionId, "review", { narrativeId, llm: opts.llm });
  return { diffId, narrativeId };
}
