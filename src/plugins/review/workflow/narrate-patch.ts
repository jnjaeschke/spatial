import type { Id, LlmSelection } from "../../../shared/types.ts";
import type { Runtime } from "../../../runtime/tasks.ts";
import { diffsOf, diffNumber, interdiffOf, narrativeOf } from "../shared/diffs.ts";
import { mappableSpecs } from "../tasks/map-spec-steps/task.ts";

/** narrate → (carryFindings) → resolveSpecRefs → review for an imported Diff, with mapSpecSteps for each spec section with steps alongside the review. */
export async function narrateDiff(rt: Runtime, sessionId: Id, diffId: Id, llm?: LlmSelection): Promise<void> {
  const artifacts = rt.store.listArtifacts(sessionId);
  const links = rt.store.listLinks(sessionId);
  const number = diffNumber(artifacts, diffId);
  const diffs = diffsOf(artifacts);
  const previous = number >= 2 ? narrativeOf(artifacts, diffs[number - 2]!.id) : null;
  const interdiff = number >= 2 ? interdiffOf(artifacts, links, diffId) : null;
  const update = previous && interdiff ? { previousNarrativeId: previous.id, interdiffId: interdiff.id } : undefined;
  const { narrativeId } = await rt.run<{ narrativeId: Id }>(sessionId, "narrate", { diffId, llm, ...(update ? { update } : {}) });
  if (number >= 2) await rt.run(sessionId, "carryFindings", { narrativeId });
  await rt.run(sessionId, "resolveSpecRefs", { narrativeId });
  const view = { artifacts: rt.store.listArtifacts(sessionId), links: rt.store.listLinks(sessionId) };
  // A failed mapping stays visible on its task record; the review is complete without it.
  const mappings = Promise.allSettled(mappableSpecs(view, narrativeId).map((specId) => rt.run(sessionId, "mapSpecSteps", { narrativeId, specId, llm })));
  await rt.run(sessionId, "review", { narrativeId, llm });
  await mappings;
}

