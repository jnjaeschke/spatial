import { defineTask, runStructured, type JsonSchema } from "../../../../plugin-api.ts";
import type { SpecAlgorithmData, SpecSummary } from "../../shared/types.ts";
import { parseSteps, stepLines } from "../../shared/steps.ts";

const SYSTEM = "You summarize one web spec algorithm for an engineer about to read it. Write 1 to 4 clauses that together say what the algorithm does, in execution order. Each clause cites the steps it summarizes by their paths (\"4.2\"). Put identifiers in backticks: variables, linked terms, event names and called algorithms, spelled exactly as in the cited steps. Say nothing the cited steps do not say.";
const SCHEMA: JsonSchema = { type: "object", additionalProperties: false, required: ["clauses"], properties: { clauses: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "steps"], properties: { text: { type: "string" }, steps: { type: "array", items: { type: "string" } } } } } } };

/** An LLM summary of an algorithm's steps (unverified; `ensureSummary` checks it). */
export const summarizeAlgorithm = defineTask<{ algorithmId: string }, SpecSummary>({
  kind: "summarizeAlgorithm",
  async run(ctx, { algorithmId }) {
    const algorithm = ctx.artifacts.get<SpecAlgorithmData>(algorithmId, "SpecAlgorithm");
    const steps = parseSteps(algorithm.data.content);
    const prompt = [`# ${algorithm.data.ref}: ${algorithm.data.title}`, "", stepLines(steps)].join("\n");
    return (await runStructured<SpecSummary>(ctx.llm, { prompt, system: SYSTEM, schema: SCHEMA, cwd: ctx.repo, tools: "none", label: "Summary" })).json;
  },
});
