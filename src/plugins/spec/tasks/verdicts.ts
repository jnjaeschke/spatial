import { runStructured, type JsonSchema, type TaskContext } from "../../../plugin-api.ts";

/** An adversarial verdict on one item. */
export interface Verdict { supported: boolean; reason: string }

const VERDICT: JsonSchema = { type: "object", additionalProperties: false, required: ["supported", "reason"], properties: { supported: { type: "boolean" }, reason: { type: "string" } } };

/** The LLM's verdict per item: a reply `{ [field]: Verdict[] }` with exactly `count` verdicts, repaired once. */
export async function runVerdicts(ctx: Pick<TaskContext, "llm" | "repo">, { field, count, system, prompt, label }: { field: string; count: number; system: string; prompt: string; label: string }): Promise<Verdict[]> {
  const schema: JsonSchema = { type: "object", additionalProperties: false, required: [field], properties: { [field]: { type: "array", items: VERDICT } } };
  const { json } = await runStructured<Record<string, Verdict[]>>(ctx.llm, { prompt, system, schema, cwd: ctx.repo, tools: "none", label, repairs: 1, validate: (reply) => { const n = (reply as Record<string, unknown[]>)[field]!.length; return n === count ? [] : [`Expected ${count} verdicts, got ${n}`]; } });
  return json[field]!;
}
