import { defineTask, plainText, readRepoSkill, runStructured, type Engine, type Id, type JsonSchema, type TaskContext } from "../../../../plugin-api.ts";
import type { EngineMapping, EngineSite, SpecAlgorithmData } from "../../shared/types.ts";
import { parseSteps } from "../../shared/steps.ts";
import { siteKey, siteName } from "../../shared/engine.ts";
import { storedMapping } from "../../runtime/mappings.ts";
import { verifyCandidate, type ImplementationCandidate } from "../../runtime/engine-map.ts";

const TASK = "You find where Gecko (mozilla-central) implements one web spec algorithm or concept. Search the code with searchfox-cli and the spec with webspec-index. Propose up to 3 places, best first, each one you have read in the code: `path` from the repository root, `line` inside the function (or the declaration, for a concept), `quote` that line's exact text, and `why` in one sentence citing the code. An empty list is a valid answer.";
const COMMANDS = "Useful commands: `webspec-index query <SPEC#anchor>`, `webspec-index refs <SPEC#anchor>` (callers and callees), `searchfox-cli -q <text>`, `searchfox-cli --define <Class::Method>`, `searchfox-cli --calls-to <symbol>`, `searchfox-cli --get-file <path> --lines <a-b>`. Gecko names functions after spec terms in CamelCase and often links the spec in comments.";
const SCHEMA: JsonSchema = { type: "object", additionalProperties: false, required: ["candidates"], properties: { candidates: { type: "array", items: { type: "object", additionalProperties: false, required: ["path", "line", "quote", "why"], properties: { path: { type: "string" }, line: { type: "integer" }, quote: { type: "string" }, why: { type: "string" } } } } } };
const MAX_CANDIDATES = 3;
const MAX_SEEDS = 12;

/** The verified places of an LLM search, and the candidates it dropped with the reason. */
export interface FoundImplementation { sites: EngineSite[]; dropped: { candidate: ImplementationCandidate; reason: string }[] }

/** Tier 3: an LLM search for where `engine` implements an algorithm, seeded with its neighbours' known sites there; returns verified, new candidates as proposals (it stores nothing). Its instructions are Gecko's, the one engine with a code search. */
export const findImplementation = defineTask<{ algorithmId: Id; engine: Engine; stale: EngineSite | null }, FoundImplementation>({
  kind: "findImplementation",
  async run(ctx, { algorithmId, engine, stale }) {
    const algorithm = ctx.artifacts.get<SpecAlgorithmData>(algorithmId).data;
    const current = storedMapping(ctx.knowledge, engine, algorithm.ref);
    const instructions = ctx.repoSkills.some((skill) => skill.name === "specmap") ? readRepoSkill(ctx.repo, "specmap") : COMMANDS;
    const prompt = await findPrompt(ctx, engine, algorithm, current, stale);
    const { json } = await runStructured<{ candidates: ImplementationCandidate[] }>(ctx.llm, { prompt, system: `${instructions}\n\n${TASK}`, schema: SCHEMA, cwd: ctx.repo, tools: "read-only", label: "Gecko candidates" });
    const known = new Set([...(current?.sites ?? []).filter((site) => !site.stale).map(siteKey), ...(current?.rejected ?? []).map(siteKey)]);
    const out: FoundImplementation = { sites: [], dropped: [] };
    for (const candidate of json.candidates.slice(0, MAX_CANDIDATES)) {
      const result = await verifyCandidate(ctx.codeSearch[engine], candidate, ctx.signal);
      if (!result.ok) out.dropped.push({ candidate, reason: result.reason });
      else if (known.has(siteKey(result.site))) out.dropped.push({ candidate, reason: "already known or rejected" });
      else { known.add(siteKey(result.site)); out.sites.push(result.site); }
    }
    return out;
  },
});

async function findPrompt(ctx: TaskContext, engine: Engine, algorithm: SpecAlgorithmData, current: EngineMapping | null, stale: EngineSite | null): Promise<string> {
  const steps = parseSteps(algorithm.content);
  const body = steps.length ? ["## Steps", ...steps.map((step) => `${"    ".repeat(step.depth)}[${step.number}] ${step.text}`)] : ["## Definition", plainText(algorithm.content).slice(0, 4000)];
  const seeds = await seedLines(ctx, engine, algorithm.ref);
  const rejected = current?.rejected ?? [];
  return [`# ${algorithm.ref}: ${algorithm.title}`, algorithm.url, "", ...body, "", "## Known Gecko sites of neighbouring algorithms", ...(seeds.length ? seeds : ["None known."]), ...(rejected.length ? ["", "## Rejected by the user (do not propose)", ...rejected.map((site) => `- ${site.path} \`${site.signature}\``)] : []), ...(stale ? ["", "## Moved", `This place was found earlier and is gone at the current revision; find where its code went: ${stale.path}:${stale.line} \`${stale.signature}\`, quote \`${stale.quote}\`.`] : [])].join("\n");
}

/** Spec-link and confirmed sites in `engine` of the algorithms that call `ref` or that it calls, as prompt lines. */
async function seedLines(ctx: TaskContext, engine: Engine, ref: string): Promise<string[]> {
  const { incoming, outgoing } = await ctx.webspec.refs(ref, ctx.signal);
  const lines: string[] = [];
  for (const [neighbour, relation] of [...outgoing.map((r) => [r, "called here"] as const), ...incoming.map((r) => [r, "calls this"] as const)]) {
    for (const site of storedMapping(ctx.knowledge, engine, neighbour)?.sites ?? []) {
      if (site.stale || site.method === "llm" || lines.length >= MAX_SEEDS) continue;
      lines.push(`- ${neighbour} (${relation}): \`${siteName(site)}\` at ${site.path}:${site.line}`);
    }
  }
  return lines;
}
