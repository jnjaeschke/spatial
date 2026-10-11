import { defineTask, runStructured, type JsonSchema } from "../../../../plugin-api.ts";
import type { SpecAlgorithmData, SpecSummary } from "../../shared/types.ts";
import { parseSteps } from "../../shared/steps.ts";
import { citedText } from "../../shared/summary-check.ts";

const SYSTEM = "You check a summary of a web spec algorithm adversarially. For each clause, decide whether its cited steps fully support it: anything the steps do not state, or state differently, is unsupported. Give a one-sentence reason per clause.";
const SCHEMA: JsonSchema = { type: "object", additionalProperties: false, required: ["clauses"], properties: { clauses: { type: "array", items: { type: "object", additionalProperties: false, required: ["supported", "reason"], properties: { supported: { type: "boolean" }, reason: { type: "string" } } } } } };

/** An adversarial LLM verdict per summary clause against its cited steps. */
export const verifySummary = defineTask<{ algorithmId: string; clauses: SpecSummary["clauses"] }, { clauses: { supported: boolean; reason: string }[] }>({
  kind: "verifySummary",
  async run(ctx, { algorithmId, clauses }) {
    const algorithm = ctx.artifacts.get<SpecAlgorithmData>(algorithmId);
    const steps = parseSteps(algorithm.data.content);
    const prompt = clauses.map((clause, index) => [`## Clause ${index + 1}`, clause.text, "", "Cited steps:", ...clause.steps.map((path) => `[${path}] ${citedText(steps, path)}`)].join("\n")).join("\n\n");
    return (await runStructured<{ clauses: { supported: boolean; reason: string }[] }>(ctx.llm, { prompt, system: SYSTEM, schema: SCHEMA, cwd: ctx.repo, tools: "none", label: "Summary verdicts", repairs: 1, validate: (json) => { const n = (json as { clauses: unknown[] }).clauses.length; return n === clauses.length ? [] : [`Expected ${clauses.length} verdicts, got ${n}`]; } })).json;
  },
});
