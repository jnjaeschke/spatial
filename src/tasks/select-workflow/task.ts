import { readFileSync } from "node:fs";
import { z } from "zod";
import type { Id, LlmSelection, SelectorQuestionData, WorkflowId, WorkflowStartData } from "../../shared/types.ts";
import { defineTask } from "../../runtime/tasks.ts";
import { workflows } from "../../workflows/registry.ts";
import { prependRepoContext } from "../../runtime/repo-context.ts";

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");

const jsonSchema = (type: z.ZodType): Record<string, unknown> => {
  const { $schema: _, ...schema } = z.toJSONSchema(type) as Record<string, unknown>;
  return schema;
};

/** Output schema: `{ question, workflow, title, params }`, params any workflow's param schema; a non-null `question` asks the user instead of choosing. */
export function selectorSchema(): Record<string, unknown> {
  const all = Object.values(workflows);
  return jsonSchema(z.strictObject({
    question: z.string().nullable(),
    workflow: z.enum(all.map((w) => w.id) as [WorkflowId, ...WorkflowId[]]),
    title: z.string(),
    params: z.union(all.map((w) => w.params) as [z.ZodType, z.ZodType, ...z.ZodType[]]),
  }));
}

/** Questions the selector may ask before it has to choose. */
export const MAX_SELECTOR_QUESTIONS = 2;

/** Chooses a workflow for the request, or asks the user one question (`round` counts questions already asked). */
export const selectWorkflow = defineTask<{ prompt: string; round?: number; llm?: LlmSelection }, { startId: Id } | { questionId: Id }>({
  kind: "selectWorkflow",
  async run(ctx, { prompt, round = 0, llm }) {
    if (!prompt.trim()) throw new Error("Request is empty");
    const list = Object.values(workflows).map((w) => `- ${w.id}: ${w.description}\n  params: ${JSON.stringify(jsonSchema(w.params))}`).join("\n");
    const final = round >= MAX_SELECTOR_QUESTIONS ? ["", "You have asked enough; choose now and set `question` to null."] : [];
    const r = await ctx.llm.run({ prompt: ["# Workflows", "", list, "", "# Request", "", prompt, ...final].join("\n"), system: prependRepoContext(SYSTEM, ctx), schema: selectorSchema(), cwd: ctx.repo, tools: "read-only", mcpServers: { ...ctx.sessionMcp, ...ctx.repoMcp } }, llm);
    const json = r.json as { question?: unknown; workflow?: unknown; title?: unknown; params?: unknown } | undefined;
    if (typeof json?.question === "string" && json.question.trim()) {
      if (round >= MAX_SELECTOR_QUESTIONS) throw new Error(`Selector still asks after ${round} answers: ${json.question}`);
      const question = ctx.artifacts.put<SelectorQuestionData>("SelectorQuestion", "proposed", { prompt, question: json.question.trim(), round: round + 1 }, r.selection);
      return { questionId: question.id };
    }
    const id = json?.workflow;
    if (typeof id !== "string" || !Object.hasOwn(workflows, id)) throw new Error(`Selector chose an unknown workflow: ${JSON.stringify(id)}`);
    const workflow = workflows[id as WorkflowId];
    const params = workflow.params.safeParse(json!.params);
    if (!params.success) throw new Error(`Selector returned invalid params for ${id}: ${params.error.message}`);
    const title = typeof json!.title === "string" ? json!.title.trim().slice(0, 80) : "";
    if (!title) throw new Error("Selector returned no title");
    const start = ctx.artifacts.put<WorkflowStartData>("WorkflowStart", "proposed", { via: "selector", workflow: workflow.id, params: params.data, title, prompt }, r.selection);
    return { startId: start.id };
  },
});
