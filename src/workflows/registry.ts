import type { Workflow } from "../runtime/plugins.ts";
import type { WorkflowInfo } from "../shared/types.ts";

export function workflowInfo(workflows: Iterable<Workflow<any>>): WorkflowInfo[] {
  return [...workflows].map(({ id, description, argHint }) => ({ id, description, argHint }));
}

/** Parses `/<id> <args>`. Unknown command or bad arguments -> error; never throws. */
export function parseCommand(workflows: Iterable<Workflow<any>>, text: string): { ok: true; workflow: string; params: unknown; prompt: string } | { ok: false; error: string } {
  const entries = [...workflows], byId = new Map(entries.map((workflow) => [workflow.id, workflow]));
  const m = /^(\/\S*)\s*([\s\S]*)$/.exec(text.trim());
  if (!m) return { ok: false, error: "Not a command" };
  const name = m[1]!.slice(1), workflow = byId.get(name);
  if (!workflow) return { ok: false, error: `Unknown command /${name}; available: ${entries.map(({ id }) => `/${id}`).join(", ")}` };
  const parsed = workflow.parseArgs(m[2]!);
  return parsed.ok ? { ok: true, workflow: workflow.id, params: parsed.params, prompt: m[2]!.trim() } : parsed;
}
