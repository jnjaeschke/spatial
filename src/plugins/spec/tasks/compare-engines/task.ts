import { defineTask, runStructured, type Id, type JsonSchema } from "../../../../plugin-api.ts";
import { ENGINES } from "../../shared/engines.ts";
import type { Engine } from "../../shared/types.ts";
import type { EngineComparison, SpecAlgorithmData } from "../../shared/types.ts";
import { parseSteps, stepLines } from "../../shared/steps.ts";
import { DATA_PREAMBLE, fence } from "../../shared/prompt.ts";

/** Per engine, its sites' functions as numbered source with the step ranges known so far. */
export interface CompareInput { algorithmId: Id; engines: { engine: Engine; sites: { path: string; name: string; source: string; steps: { step: string; line: number; end: number }[] }[] }[] }

const SYSTEM = "You compare how browser engines implement one web spec algorithm. List the differences that matter for interoperability: steps done in another order, missing or extra work, different conditions. Each difference cites the steps it concerns by path (\"4.2\") and makes one claim per engine involved; each claim cites the code lines it rests on by path, line and the exact text of that line as `quote`. Put identifiers in backticks, spelled as in the cited code or steps. Report nothing you cannot cite; an empty list is a valid answer.";
const CODE: JsonSchema = { type: "object", additionalProperties: false, required: ["path", "line", "quote"], properties: { path: { type: "string" }, line: { type: "integer" }, quote: { type: "string" } } };
const SCHEMA: JsonSchema = { type: "object", additionalProperties: false, required: ["differences"], properties: { differences: { type: "array", items: { type: "object", additionalProperties: false, required: ["kind", "steps", "summary", "claims"], properties: {
  kind: { type: "string", enum: ["order", "missing", "extra", "condition", "other"] }, steps: { type: "array", items: { type: "string" } }, summary: { type: "string" },
  claims: { type: "array", items: { type: "object", additionalProperties: false, required: ["engine", "text", "code"], properties: { engine: { type: "string", enum: [...ENGINES] }, text: { type: "string" }, code: { type: "array", items: CODE } } } },
} } } } };

/** An LLM comparison of engine implementations; `compareAlgorithm` checks it. */
export const compareEngines = defineTask<CompareInput, EngineComparison>({
  kind: "compareEngines",
  async run(ctx, { algorithmId, engines }) {
    const algorithm = ctx.artifacts.get<SpecAlgorithmData>(algorithmId).data;
    const prompt = [DATA_PREAMBLE, "", `# Compare engines on ${algorithm.ref}: ${algorithm.title}`, "", "## Steps", fence(stepLines(parseSteps(algorithm.content))),
      ...engines.flatMap(({ engine, sites }) => ["", `## ${engine}`, ...sites.flatMap((site) => ["", fence(`${site.name} (${site.path})\nKnown step ranges: ${site.steps.length ? site.steps.map((step) => `${step.step}: ${step.line}-${step.end}`).join(", ") : "none"}\n${site.source}`)])])].join("\n");
    return (await runStructured<EngineComparison>(ctx.llm, { prompt, system: SYSTEM, schema: SCHEMA, cwd: ctx.repo, tools: "none", label: "Engine comparison" })).json;
  },
});
