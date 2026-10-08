import type { Id, LlmSelection } from "../../../shared/types.ts";
import { latestDiff, sessionRefs } from "../shared/diffs.ts";
import type { Runtime } from "../../../runtime/tasks.ts";

/** Starts an update review phase for the session's current refs. */
export async function updateRevision(rt: Runtime, sessionId: Id, llm?: LlmSelection): Promise<void> {
  const artifacts = rt.store.listArtifacts(sessionId);
  const tasks = rt.store.listTasks(sessionId);
  if (!latestDiff(artifacts)) throw new Error("Session has no imported diff");
  const refs = sessionRefs(artifacts, tasks);
  if (!refs) throw new Error("Cannot find the refs of the session");
  const git = rt.gitFor(sessionId);
  const head = await git.resolve(refs.head);
  const base = await git.mergeBase(await git.resolve(refs.base), head);
  if (!base) throw new Error(`${refs.base} and ${refs.head} have no common ancestor`);
  await rt.runPhase(sessionId, "review", { base, head, update: true, llm });
}
