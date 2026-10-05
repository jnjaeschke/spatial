import type { Id, LlmSelection } from "../shared/types.ts";
import type { Runtime } from "../runtime/tasks.ts";

/** importDiff → narrate → resolveSpecRefs → review. Plain orchestration; no workflow engine. */
export async function narratePatch(
  rt: Runtime,
  sessionId: Id,
  opts: { base: string; head: string; llm?: LlmSelection },
): Promise<{ diffId: Id; narrativeId: Id }> {
  const { diffId } = await rt.run<{ diffId: Id }>(sessionId, "importDiff", { base: opts.base, head: opts.head });
  const { narrativeId } = await rt.run<{ narrativeId: Id }>(sessionId, "narrate", { diffId, llm: opts.llm });
  await rt.run(sessionId, "resolveSpecRefs", { narrativeId });
  await rt.run(sessionId, "review", { narrativeId, llm: opts.llm });
  return { diffId, narrativeId };
}
