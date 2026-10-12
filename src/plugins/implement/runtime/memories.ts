import type { Id, Knowledge, TaskContext } from "../../../plugin-api.ts";
import type { MemoryScope, MemoryView, SteerMemory, UsedMemoriesData } from "../shared/types.ts";

export const MEMORY_NAMESPACE = "implement";
/** The phases whose prompts carry memories. */
export const MEMORY_PHASES = ["investigate", "implement", "reviewerComments"];
export const MEMORY_KINDS = ["bugfix", "feature", "spec", "refactor", "perf"];
const SLUG = /^[a-z0-9-]{3,60}$/;

export const isSlug = (key: string): boolean => SLUG.test(key);
export const memoryKey = (slug: string): string => `memory/${slug}`;
/** A `confirmed/<slug>` entry holds `{ entryId }` of the memory version the user confirmed. */
export const confirmedKey = (slug: string): string => `confirmed/${slug}`;
export const scopeId = (scope: MemoryScope, repoDir: string): string => scope === "repo" ? repoDir : "global";

/** The current, non-tombstoned memories of the repository, then the global ones, each ordered by slug. */
export function currentMemories(knowledge: Pick<Knowledge, "list">, repoDir: string): MemoryView[] {
  return (["repo", "global"] as const).flatMap((scope) => {
    const id = scopeId(scope, repoDir);
    const confirmed = new Map(knowledge.list(id, MEMORY_NAMESPACE, "confirmed/").map((entry) => [entry.key.slice("confirmed/".length), (entry.value as { entryId: Id } | null)?.entryId]));
    return knowledge.list(id, MEMORY_NAMESPACE, "memory/").filter((entry) => entry.value !== null).map((entry) => {
      const key = entry.key.slice("memory/".length);
      return { scope, key, entryId: entry.id, memory: entry.value as SteerMemory, confirmed: confirmed.get(key) === entry.id };
    });
  });
}

/** The memories for a phase: those listing the phase and applying to every kind or to `kind`. A null kind (not known yet) matches the kind-agnostic ones only. */
export function relevantMemories(knowledge: Pick<Knowledge, "list">, repoDir: string, phase: string, kind: string | null): MemoryView[] {
  return currentMemories(knowledge, repoDir).filter(({ memory }) => memory.phases.includes(phase) && (memory.kinds.length === 0 || (kind !== null && memory.kinds.includes(kind))));
}

export const memoryBullet = ({ memory }: MemoryView): string => `- When ${memory.situation}: ${memory.wanted}${memory.why ? ` (${memory.why})` : ""}`;

/** Prompt sections for the memories relevant to `phase` and `kind`; when there are any it also records them as a `UsedMemories` artifact of the task's epoch. */
export function memorySections(ctx: Pick<TaskContext, "knowledge" | "repoDir" | "artifacts">, phase: string, kind: string | null): string[] {
  const used = relevantMemories(ctx.knowledge, ctx.repoDir, phase, kind);
  if (used.length === 0) return [];
  ctx.artifacts.put<UsedMemoriesData>("UsedMemories", "verified", { entries: used.map(({ scope, key, entryId }) => ({ scope, key, entryId })) });
  return ["# How this user wants things done", used.map(memoryBullet).join("\n")];
}

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

/** What is wrong with the editable fields of a memory (`source` is not checked here); empty when valid. */
export function memoryProblems(memory: unknown): string[] {
  if (typeof memory !== "object" || memory === null) return ["memory must be an object"];
  const m = memory as Partial<Omit<SteerMemory, "source">>;
  const problems: string[] = [];
  for (const field of ["situation", "observed", "wanted"] as const) if (!nonEmpty(m[field])) problems.push(`${field} must be a non-empty string`);
  if (m.why !== null && !nonEmpty(m.why)) problems.push("why must be null or a non-empty string");
  const list = (name: "phases" | "kinds", allowed: string[], required: boolean) => {
    const value = m[name];
    if (!Array.isArray(value) || value.some((item) => !allowed.includes(item as string))) problems.push(`${name} must be a list of ${allowed.join(", ")}`);
    else if (required && value.length === 0) problems.push(`${name} must not be empty`);
  };
  list("phases", MEMORY_PHASES, true);
  list("kinds", MEMORY_KINDS, false);
  return problems;
}

/** The reply of the `distillSteer` task. */
export interface DistillReply { action: "add" | "update"; key: string; scope: MemoryScope; memory: Omit<SteerMemory, "source"> }

/** What is wrong with a distillation given the current memories: invalid fields or slug, `update` of a memory that does not exist, `add` over one that does. */
export function distillProblems(reply: DistillReply, existing: MemoryView[]): string[] {
  const problems = memoryProblems(reply.memory);
  if (!isSlug(reply.key)) problems.push("key must match ^[a-z0-9-]{3,60}$");
  const exists = existing.some((view) => view.scope === reply.scope && view.key === reply.key);
  if (reply.action === "update" && !exists) problems.push(`update needs an existing memory; ${reply.key} is not one in ${reply.scope} scope`);
  if (reply.action === "add" && exists) problems.push(`${reply.key} exists in ${reply.scope} scope; use update`);
  return problems;
}
