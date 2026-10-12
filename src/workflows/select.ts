import { readFileSync } from "node:fs";
import { z } from "zod";
import type { LlmSelection } from "../shared/types.ts";
import type { Workflow } from "../runtime/plugins.ts";
import type { Runtime } from "../runtime/tasks.ts";
import { prependRepoContext } from "../runtime/repo-context.ts";

const SYSTEM = readFileSync(new URL("./select-prompt.md", import.meta.url), "utf8");

const jsonSchema = (type: z.ZodType): Record<string, unknown> => {
  const { $schema: _, ...schema } = z.toJSONSchema(type) as Record<string, unknown>;
  return schema;
};

/** Output schema: `{ question, workflow, title, params }`, params any workflow's param schema; a non-null `question` asks the user instead of choosing. */
export function selectorSchema(workflows: ReadonlyMap<string, Workflow<any>>): Record<string, unknown> {
  const all = [...workflows.values()];
  return jsonSchema(z.strictObject({
    question: z.string().nullable(),
    workflow: z.enum(all.map((w) => w.id) as [string, ...string[]]),
    title: z.string(),
    params: z.union(all.map((w) => w.params) as [z.ZodType, z.ZodType, ...z.ZodType[]]),
  }));
}

/** Questions the selector may ask before it has to choose. */
export const MAX_SELECTOR_QUESTIONS = 2;

/** What the selector decided: a question for the user, or a workflow with validated params and a title. `selection` is the model that decided. */
export type Selection = { question: string } | { workflow: string; params: unknown; title: string; selection: LlmSelection };

/** Chooses a workflow for the request in `repo`, or asks the user one question (`round` counts questions already asked). Runs before any session exists. */
export async function selectWorkflow(rt: Runtime, repo: string, prompt: string, round: number, llm: LlmSelection | undefined, signal: AbortSignal): Promise<Selection> {
  if (!prompt.trim()) throw new Error("Request is empty");
  const workflows = rt.workflows;
  const list = [...workflows.values()].map((w) => `- ${w.id}: ${w.description}\n  params: ${JSON.stringify(jsonSchema(w.params))}`).join("\n");
  const profiles = await Promise.all([...rt.plugins.repoProfiles.values()].map(async (profile) => `- ${profile.id}${await profile.detect?.(repo) ? " (detected in this repository)" : ""}: ${profile.description}`));
  const final = round >= MAX_SELECTOR_QUESTIONS ? ["", "You have asked enough; choose now and set `question` to null."] : [];
  const { context, mcpServers } = rt.repoLlmContext(repo);
  const system = prependRepoContext(SYSTEM, { repoInstructions: context.instructions, repoSkills: context.skills });
  const r = await rt.llm.run(llm, { prompt: ["# Workflows", "", list, "", ...(profiles.length ? ["# Repo profiles", "", ...profiles, ""] : []), "# Request", "", prompt, ...final].join("\n"), system, schema: selectorSchema(workflows), cwd: repo, tools: "read-only", mcpServers }, signal);
  const json = r.json as { question?: unknown; workflow?: unknown; title?: unknown; params?: unknown } | undefined;
  if (typeof json?.question === "string" && json.question.trim()) {
    if (round >= MAX_SELECTOR_QUESTIONS) throw new Error(`Selector still asks after ${round} answers: ${json.question}`);
    return { question: json.question.trim() };
  }
  const id = json?.workflow;
  if (typeof id !== "string" || !workflows.has(id)) throw new Error(`Selector chose an unknown workflow: ${JSON.stringify(id)}`);
  const params = workflows.get(id)!.params.safeParse(json!.params);
  if (!params.success) throw new Error(`Selector returned invalid params for ${id}: ${params.error.message}`);
  const title = typeof json!.title === "string" ? json!.title.trim().slice(0, 80) : "";
  if (!title) throw new Error("Selector returned no title");
  return { workflow: id, params: params.data, title, selection: r.selection };
}
