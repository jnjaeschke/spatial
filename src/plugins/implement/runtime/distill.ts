import type { Artifact, Id, NotifyPayload, Runtime } from "../../../plugin-api.ts";
import type { MemoryNoticeData, SteerData, SteerMemory } from "../shared/types.ts";
import type { DistillInput } from "../tasks/distill-steer/task.ts";
import { MEMORY_NAMESPACE, memoryKey, scopeId, type DistillReply } from "./memories.ts";

/** Distills a steer, then writes the memory (the task only proposes), a verified notice linked to the steer, and a toast. */
export async function rememberSteer(rt: Runtime, sessionId: Id, steer: Artifact<SteerData>, progressTaskId: Id | null): Promise<void> {
  const { taskId, done } = rt.start<DistillReply>(sessionId, "distillSteer", { steerId: steer.id, taskId: progressTaskId } satisfies DistillInput);
  const reply = await done;
  const memory: SteerMemory = { ...reply.memory, source: { sessionId, epoch: steer.data.epoch, steer: steer.id } };
  const entry = rt.knowledge.put(scopeId(reply.scope, rt.store.getSession(sessionId).repoDir), MEMORY_NAMESPACE, memoryKey(reply.key), memory, { by: "llm", taskId, sessionId });
  const notice = rt.store.putArtifact<MemoryNoticeData>({ sessionId, type: "MemoryNotice", status: "verified", data: { key: reply.key, scope: reply.scope, entryId: entry.id, memory }, provenance: { taskId } });
  const link = rt.store.putLink({ sessionId, from: notice.id, to: steer.id, kind: "about" });
  rt.emit(sessionId, "runtime", "artifact.created", { artifactId: notice.id, type: notice.type });
  rt.emit(sessionId, "runtime", "link.created", { linkId: link.id, from: notice.id, to: steer.id, kind: "about" });
  rt.emit(sessionId, "runtime", "notify", { id: `memory-${entry.id}`, title: `Remembered: ${memory.wanted}`, body: `When ${memory.situation}` } satisfies NotifyPayload);
}
