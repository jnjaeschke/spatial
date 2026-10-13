import { defineTask, runStructured, type Id, type JsonSchema } from "../../../../plugin-api.ts";
import type { Engine } from "../../shared/types.ts";
import type { EngineStep, SpecAlgorithmData } from "../../shared/types.ts";
import { parseSteps, stepLines } from "../../shared/steps.ts";
import { numbered, shiftSteps, siteKey, siteName, usedSites } from "../../shared/engine.ts";
import { DATA_PREAMBLE, fence } from "../../shared/prompt.ts";
import { checkAlignment, type ProposedAlignment } from "../../shared/align-check.ts";
import { storedMapping } from "../../runtime/mappings.ts";
import { siteAtTip } from "../../runtime/engine-map.ts";
import { specServices } from "../../runtime/services.ts";

const SYSTEM = "You align the steps of a web spec algorithm with one function that implements it. For each step the function implements, give its line range (first and last line, inclusive, within the function) and why, naming identifiers in backticks exactly as they appear in those lines. Leave out steps the function does not implement.";
const SCHEMA: JsonSchema = { type: "object", additionalProperties: false, required: ["steps"], properties: { steps: { type: "array", items: { type: "object", additionalProperties: false, required: ["step", "lines", "why"], properties: { step: { type: "string" }, lines: { type: "array", items: { type: "integer" } }, why: { type: "string" } } } } } };

/** LLM step ranges inside one site's function, checked against the function at the current revision and returned at the site's stored line. */
export const alignSteps = defineTask<{ algorithmId: Id; engine: Engine; key: string }, { steps: EngineStep[]; dropped: string[] }>({
  kind: "alignSteps",
  async run(ctx, { algorithmId, engine, key }) {
    const algorithm = ctx.artifacts.get<SpecAlgorithmData>(algorithmId).data;
    const site = usedSites(storedMapping(ctx.knowledge, engine, algorithm.ref)).find((candidate) => siteKey(candidate) === key);
    if (!site) throw new Error(`No site ${key} in the ${engine} mapping of ${algorithm.ref}`);
    const found = await siteAtTip(specServices(ctx).codeSearch[engine], site, ctx.signal);
    if (!found) throw new Error(`${site.path}:${site.line} no longer reads \`${site.quote}\` in ${engine}; refresh the mapping`);
    const { lines, at, fn } = found;
    if (!fn) throw new Error(`No function at ${site.path}:${at}`);
    const steps = parseSteps(algorithm.content);
    const prompt = [DATA_PREAMBLE, "", `# Align ${algorithm.ref}: ${algorithm.title} (${engine})`, "", "## Steps", fence(stepLines(steps)), "", "## Function", fence(`${siteName(site)} (${site.path} lines ${fn.line}-${fn.end})\n${numbered(lines, fn.line, fn.end)}`)].join("\n");
    const { json } = await runStructured<{ steps: ProposedAlignment[] }>(ctx.llm, { prompt, system: SYSTEM, schema: SCHEMA, cwd: ctx.repo, tools: "none", label: "Step alignment" });
    const checked = checkAlignment(json.steps, steps, fn, lines);
    return { ...checked, steps: shiftSteps(checked.steps, site.line - at) };
  },
});
