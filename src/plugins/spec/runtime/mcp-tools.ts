import { z } from "zod";
import { defineMcpTool, ENGINES, type CodeSearch, type McpTool } from "../../../plugin-api.ts";
import { mappingKey, shiftSteps, usedSites } from "../shared/engine.ts";
import { storedMapping } from "./mappings.ts";
import { siteAtTip } from "./engine-map.ts";

const ref = z.string().describe("A SPEC#anchor ref, e.g. HTML#navigate");
const step = z.string().describe('A dotted step path, e.g. "24.9"');
const engine = z.enum(ENGINES);

/** Read-only webspec-index tools of the session MCP server, for LLM tasks that walk spec algorithms. */
export const specMcpTools: McpTool[] = [
  defineMcpTool({ name: "spec_query", description: "Read a spec section: its steps as markdown, numbered as dotted step paths, with links as SPEC#anchor refs. `steps` keeps only those steps (and their sub-steps).", input: { ref, steps: step.optional() }, run: (ctx, input) => ctx.webspec.lookup({ command: "query", ref: input.ref, steps: input.steps ?? null }, ctx.signal) }),
  defineMcpTool({ name: "spec_refs", description: "Sections that link to a spec section (incoming) or that it links (outgoing).", input: { ref, direction: z.enum(["incoming", "outgoing"]), limit: z.number().int().min(1).max(100).optional() }, run: (ctx, input) => ctx.webspec.lookup({ command: "refs", ref: input.ref, direction: input.direction, limit: input.limit ?? 20 }, ctx.signal) }),
  defineMcpTool({ name: "spec_effects", description: "What a section, or one of its steps, may cause directly or through the algorithms it calls: queued tasks and microtasks and parallel steps (scheduling.*), events (event.*), script runs. Each effect lists where it occurs.", input: { ref, step: step.optional() }, run: (ctx, input) => ctx.webspec.lookup({ command: "effects", ref: input.ref, step: input.step ?? null }, ctx.signal) }),
  defineMcpTool({ name: "spec_flow", description: "The control flow of an algorithm as a mermaid chart: steps, branches, parallel steps and calls.", input: { ref }, run: (ctx, input) => ctx.webspec.lookup({ command: "flow", ref: input.ref }, ctx.signal) }),
  defineMcpTool({ name: "spec_state", description: 'Where a field or concept is declared, written and initialized, e.g. HTML#ongoing-navigation or "Document".', input: { selector: z.string() }, run: (ctx, input) => ctx.webspec.lookup({ command: "state", selector: input.selector }, ctx.signal) }),
  defineMcpTool({ name: "spec_impl", description: "Where an engine implements a spec algorithm, as stored: its confirmed and spec-linked functions with file and line, and the line ranges of the steps mapped so far, all at the current revision (as code_read numbers them). Functions whose line is no longer found are marked not found. Read the code with code_read.", input: { ref, engine }, async run(ctx, input) {
    const read = ctx.knowledge.get("global", "spec", mappingKey(input.engine, input.ref));
    if (read.state === "absent") return `No ${input.engine} mapping of ${input.ref} is stored.`;
    if (read.state === "deleted") return `The ${input.engine} mapping of ${input.ref} was rejected.`;
    const files = new Map<string, Promise<string | null>>();
    const search: Pick<CodeSearch, "file"> = { file: (path, signal) => { if (!files.has(path)) files.set(path, ctx.codeSearch[input.engine].file(path, signal)); return files.get(path)!; } };
    const sites = await Promise.all(usedSites(storedMapping(ctx.knowledge, input.engine, input.ref)).map(async (site) => {
      const found = await siteAtTip(search, site, ctx.signal);
      if (!found) return `- ${site.path} ${site.signature} (not found at the current revision)`;
      return [`- ${site.path}:${found.at} ${site.signature}`, ...shiftSteps(site.steps, found.at - site.line).map((mapped) => `  step ${mapped.step}: lines ${mapped.line}-${mapped.end ?? mapped.line} (${mapped.verdict})`)].join("\n");
    }));
    if (!sites.length) return `The ${input.engine} mapping of ${input.ref} has no confirmed or spec-linked function.`;
    return [`The ${input.engine} mapping of ${input.ref} at the current revision (lines as code_read numbers them):`, ...sites].join("\n");
  } }),
  defineMcpTool({ name: "code_search", description: "Search an engine's source (Gecko: searchfox mozilla-central; Blink: Chromium code search; WebKit: searchfox). Returns path:line: snippet, at most 30 hits.", input: { engine, query: z.string().trim().min(1) }, async run(ctx, input) {
    const hits = await ctx.codeSearch[input.engine].search(input.query, ctx.signal, 30);
    return hits.length ? hits.map((hit) => `${hit.path}:${hit.line}: ${hit.snippet}`).join("\n") : "No matches.";
  } }),
  defineMcpTool({ name: "code_read", description: "Read numbered lines of an engine source file (at most 400). Quote code exactly as returned here.", input: { engine, path: z.string(), start: z.number().int().min(1), end: z.number().int().min(1) }, async run(ctx, input) {
    const text = await ctx.codeSearch[input.engine].file(input.path, ctx.signal);
    if (text === null) throw new Error(`${input.engine} has no file ${input.path}`);
    const lines = text.split("\n");
    if (input.end < input.start || input.start > lines.length) throw new Error(`${input.path} has lines 1-${lines.length}; asked for ${input.start}-${input.end}`);
    const end = Math.min(input.end, input.start + 399);
    return lines.slice(input.start - 1, end).map((line, i) => `${input.start + i}: ${line}`).join("\n");
  } }),
];
