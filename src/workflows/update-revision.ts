import type { Id, LlmSelection } from "../shared/types.ts";
import { latestDiff, sessionRefs } from "../shared/epochs.ts";
import type { Runtime } from "../runtime/tasks.ts";
import { narratePatch } from "./narrate-patch.ts";

/** Imports the session's head ref onto its merge base with the base ref, computes the interdiff against the previous Diff, then narrates and reviews it. Runs LLM tasks; call only on an explicit user request. */
export async function updateRevision(rt: Runtime, sessionId: Id, llm?: LlmSelection): Promise<{ diffId: Id; interdiffId: Id; narrativeId: Id }> {
  const artifacts = rt.store.listArtifacts(sessionId);
  const tasks = rt.store.listTasks(sessionId);
  const prev = latestDiff(artifacts);
  if (!prev) throw new Error("Session has no imported diff");
  const refs = sessionRefs(artifacts, tasks);
  if (!refs) throw new Error("Cannot find the refs of the session");
  const git = rt.gitFor(sessionId);
  const head = await git.resolve(refs.head);
  const base = await git.mergeBase(await git.resolve(refs.base), head);
  if (!base) throw new Error(`${refs.base} and ${refs.head} have no common ancestor`);
  const { diffId } = await rt.run<{ diffId: Id }>(sessionId, "importDiff", { base, head });
  const { interdiffId } = await rt.run<{ interdiffId: Id }>(sessionId, "interdiff", { fromDiffId: prev.id, toDiffId: diffId });
  const { narrativeId } = await narratePatch(rt, sessionId, { diffId, llm });
  return { diffId, interdiffId, narrativeId };
}
