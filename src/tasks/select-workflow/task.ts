import { readFileSync } from "node:fs";
import { z } from "zod";
import type { Id, LlmSelection, WorkflowId, WorkflowStartData } from "../../shared/types.ts";
import { defineTask } from "../../runtime/tasks.ts";
import { workflows } from "../../workflows/registry.ts";

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");

const jsonSchema = (type: z.ZodType): Record<string, unknown> => {
  const { $schema: _, ...schema } = z.toJSONSchema(type) as Record<string, unknown>;
  return schema;
};

/** Output schema: `{ workflow, title, params }`, params any workflow's param schema. */
export function selectorSchema(): Record<string, unknown> {
  const all = Object.values(workflows);
  return jsonSchema(z.strictObject({
    workflow: z.enum(all.map((w) => w.id) as [WorkflowId, ...WorkflowId[]]),
    title: z.string(),
    params: z.union(all.map((w) => w.params) as [z.ZodType, z.ZodType, ...z.ZodType[]]),
  }));
}

export const selectWorkflow = defineTask<{ prompt: string; llm?: LlmSelection }, { startId: Id }>({
  kind: "selectWorkflow",
  async run(ctx, { prompt, llm }) {
    if (!prompt.trim()) throw new Error("Request is empty");
    const list = Object.values(workflows).map((w) => `- ${w.id}: ${w.description}\n  params: ${JSON.stringify(jsonSchema(w.params))}`).join("\n");
    const r = await ctx.llm.run({ prompt: ["# Workflows", "", list, "", "# Request", "", prompt].join("\n"), system: SYSTEM, schema: selectorSchema(), cwd: ctx.repo, tools: "none" }, llm);
    const json = r.json as { workflow?: unknown; title?: unknown; params?: unknown } | undefined;
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
