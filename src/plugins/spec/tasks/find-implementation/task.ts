import { defineTask, ENGINE_LABEL, isGeckoRepo, plainText, readRepoSkill, runStructured, type Engine, type Id, type JsonSchema, type SpecIdlMember, type TaskContext } from "../../../../plugin-api.ts";
import type { EngineMapping, EngineSite, SpecAlgorithmData } from "../../shared/types.ts";
import { parseSteps, stepLines } from "../../shared/steps.ts";
import { numbered, siteKey, siteName, usedSites } from "../../shared/engine.ts";
import { DATA_PREAMBLE, fence } from "../../shared/prompt.ts";
import { storedMapping } from "../../runtime/mappings.ts";
import { siteAtTip, verifyCandidate, type ImplementationCandidate } from "../../runtime/engine-map.ts";

const NAME: Record<Engine, string> = { gecko: "Gecko (mozilla-central)", blink: "Blink (Chromium)", webkit: "WebKit" };

const task = (engine: Engine) => `You find where ${NAME[engine]} implements one web spec algorithm or concept. Search the code with ${engine === "gecko" ? "searchfox-cli" : "the commands below"} and the spec with webspec-index. Propose up to 3 places, best first, each one you have read in the code: \`path\` from the repository root, \`line\` inside the function (or the declaration, for a concept), \`quote\` that line's exact text, and \`why\` in one sentence citing the code. An empty list is a valid answer.`;
const COMMANDS: Record<Engine, string> = {
  gecko: "Useful commands: `webspec-index query <SPEC#anchor>`, `webspec-index refs <SPEC#anchor>` (callers and callees), `searchfox-cli -q <text>`, `searchfox-cli --define <Class::Method>`, `searchfox-cli --calls-to <symbol>`, `searchfox-cli --get-file <path> --lines <a-b>`. Gecko names functions after spec terms in CamelCase and often links the spec in comments.",
  webkit: "Useful commands: `webspec-index query <SPEC#anchor>`, `webspec-index refs <SPEC#anchor>`, `searchfox-cli -R wubkat -q <text>`, `searchfox-cli -R wubkat --define <WebCore::Class::method>`, `searchfox-cli -R wubkat --get-file <path> --lines <a-b>`. WebKit names bindings after IDL members and rarely links the spec.",
  blink: "Useful commands: `webspec-index query <SPEC#anchor>`, `webspec-index refs <SPEC#anchor>`, `chromium-search search '<query>' --json path,line,snippet` (space-separated terms must all occur in one file; `pcre:yes <regex>` matches within one line; `-file:web_tests` drops tests), `chromium-search cat <path> -n`. Blink names bindings after IDL members and cites the spec as `https://html.spec.whatwg.org/C/#anchor`.",
};
const SCHEMA: JsonSchema = { type: "object", additionalProperties: false, required: ["candidates"], properties: { candidates: { type: "array", items: { type: "object", additionalProperties: false, required: ["path", "line", "quote", "why"], properties: { path: { type: "string" }, line: { type: "integer" }, quote: { type: "string" }, why: { type: "string" } } } } } };
const MAX_CANDIDATES = 3;
const MAX_SEEDS = 12;

/** The verified places of an LLM search, and the candidates it dropped with the reason. */
export interface FoundImplementation { sites: EngineSite[]; dropped: { candidate: ImplementationCandidate; reason: string }[] }

/** Tier 3: an LLM search for where `engine` implements an algorithm, seeded with its neighbours' known sites there; returns verified, new candidates as proposals (it stores nothing). */
export const findImplementation = defineTask<{ algorithmId: Id; engine: Engine; stale: EngineSite | null }, FoundImplementation>({
  kind: "findImplementation",
  async run(ctx, { algorithmId, engine, stale }) {
    const algorithm = ctx.artifacts.get<SpecAlgorithmData>(algorithmId).data;
    const current = storedMapping(ctx.knowledge, engine, algorithm.ref);
    const instructions = isGeckoRepo(ctx.repo) && engine === "gecko" && ctx.repoSkills.some((skill) => skill.name === "specmap") ? readRepoSkill(ctx.repo, "specmap") : COMMANDS[engine];
    const prompt = await findPrompt(ctx, engine, algorithm, current, stale);
    const { json } = await runStructured<{ candidates: ImplementationCandidate[] }>(ctx.llm, { prompt, system: `${instructions}\n\n${task(engine)}`, schema: SCHEMA, cwd: ctx.repo, tools: "read-only", label: `${ENGINE_LABEL[engine]} candidates` });
    const known = new Set([...(current?.sites ?? []).filter((site) => !site.stale).map(siteKey), ...(current?.rejected ?? []).map(siteKey)]);
    const out: FoundImplementation = { sites: [], dropped: [] };
    for (const candidate of json.candidates.slice(0, MAX_CANDIDATES)) {
      let result: Awaited<ReturnType<typeof verifyCandidate>>;
      try { result = await verifyCandidate(ctx.codeSearch[engine], candidate, ctx.signal); }
      catch (error) {
        if (ctx.signal.aborted) throw error;
        out.dropped.push({ candidate, reason: `could not be checked: ${(error as Error).message}` });
        continue;
      }
      if (!result.ok) out.dropped.push({ candidate, reason: result.reason });
      else if (known.has(siteKey(result.site))) out.dropped.push({ candidate, reason: "already known or rejected" });
      else { known.add(siteKey(result.site)); out.sites.push(result.site); }
    }
    return out;
  },
});

async function findPrompt(ctx: TaskContext, engine: Engine, algorithm: SpecAlgorithmData, current: EngineMapping | null, stale: EngineSite | null): Promise<string> {
  const steps = parseSteps(algorithm.content);
  const body = steps.length ? ["## Steps", fence(stepLines(steps))] : ["## Definition", fence(plainText(algorithm.content).slice(0, 4000))];
  const refs = await ctx.webspec.refs(algorithm.ref, ctx.signal);
  const seeds = await seedLines(ctx, engine, refs);
  const idl = await idlEntryPoints(ctx, algorithm.ref, refs.incoming);
  const gecko = engine === "gecko" ? [] : await geckoCode(ctx, algorithm.ref);
  const rejected = current?.rejected ?? [];
  return [
    DATA_PREAMBLE,
    "", `# ${algorithm.ref}: ${algorithm.title}`, algorithm.url, "", ...body,
    "", "## IDL entry points", idl.length ? fence(idl.map((member) => `- ${member.canonicalName} (${member.spec}#${member.anchor})`).join("\n")) : "None known.",
    ...(engine === "gecko" ? [] : ["", "## Gecko implementation (what code for this algorithm tends to look like)", ...(gecko.length ? gecko : ["None known."])]),
    "", `## Known ${ENGINE_LABEL[engine]} sites of neighbouring algorithms`, seeds.length ? fence(seeds.join("\n")) : "None known.",
    ...(rejected.length ? ["", "## Rejected by the user (do not propose)", fence(rejected.map((site) => `${site.path} ${site.signature}`).join("\n"))] : []),
    ...(stale ? ["", "## Moved", "This place was found earlier and is gone at the current revision; find where its code went.", fence(`${stale.path}:${stale.line}\nsignature: ${stale.signature}\nquote: ${stale.quote}`)] : []),
  ].join("\n");
}

/** Spec-link and confirmed sites in `engine` of the algorithms that call `ref` or that it calls, as prompt lines. */
async function seedLines(ctx: TaskContext, engine: Engine, refs: { incoming: string[]; outgoing: string[] }): Promise<string[]> {
  const { incoming, outgoing } = refs;
  const lines: string[] = [];
  for (const [neighbour, relation] of [...outgoing.map((r) => [r, "called here"] as const), ...incoming.map((r) => [r, "calls this"] as const)]) {
    for (const site of usedSites(storedMapping(ctx.knowledge, engine, neighbour))) {
      if (lines.length >= MAX_SEEDS) continue;
      lines.push(`- ${neighbour} (${relation}): \`${siteName(site)}\` at ${site.path}:${site.line}`);
    }
  }
  return lines;
}

async function idlEntryPoints(ctx: TaskContext, ref: string, incoming: string[]): Promise<SpecIdlMember[]> {
  const members = new Map<string, SpecIdlMember>();
  for (const candidate of [ref, ...incoming.slice(0, 20)]) for (const member of await ctx.webspec.idl(candidate, ctx.signal)) members.set(member.canonicalName, member);
  return [...members.values()];
}

async function geckoCode(ctx: TaskContext, ref: string): Promise<string[]> {
  const out: string[] = [];
  for (const site of usedSites(storedMapping(ctx.knowledge, "gecko", ref)).slice(0, 3)) {
    const found = await siteAtTip(ctx.codeSearch.gecko, site, ctx.signal);
    if (!found) continue;
    const { lines, at, fn } = found;
    out.push(fence(`${siteName(site)} (${site.path}:${at})\n${numbered(lines, at, Math.min(fn?.end ?? at, at + 59))}`));
  }
  return out;
}
