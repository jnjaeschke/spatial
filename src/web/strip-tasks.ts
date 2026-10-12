import type { TaskRecord } from "../shared/types.ts";

/** The tasks the activity strip shows: those that belong to no conversation. A chat turn, its descendants and the `conversationKinds` tasks show inline in the conversation they belong to. */
export function stripTasks(tasks: TaskRecord[], conversationKinds: ReadonlySet<string>): TaskRecord[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const inConversation = (task: TaskRecord): boolean => {
    const parent = task.parentId === null ? undefined : byId.get(task.parentId);
    return task.kind === "chatTurn" || conversationKinds.has(task.kind) || (parent !== undefined && inConversation(parent));
  };
  return tasks.filter((task) => !inConversation(task));
}
