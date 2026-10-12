import { z } from "zod";
import { defineMcpTool, type McpTool } from "../../../plugin-api.ts";

const ref = z.string().describe("A SPEC#anchor ref, e.g. HTML#navigate");
const step = z.string().describe('A dotted step path, e.g. "24.9"');

/** Read-only webspec-index tools of the session MCP server, for LLM tasks that walk spec algorithms. */
export const specMcpTools: McpTool[] = [
  defineMcpTool({ name: "spec_query", description: "Read a spec section: its steps as markdown, numbered as dotted step paths, with links as SPEC#anchor refs. `steps` keeps only those steps (and their sub-steps).", input: { ref, steps: step.optional() }, run: (ctx, input) => ctx.webspec.lookup({ command: "query", ref: input.ref, steps: input.steps ?? null }, ctx.signal) }),
  defineMcpTool({ name: "spec_refs", description: "Sections that link to a spec section (incoming) or that it links (outgoing).", input: { ref, direction: z.enum(["incoming", "outgoing"]), limit: z.number().int().min(1).max(100).optional() }, run: (ctx, input) => ctx.webspec.lookup({ command: "refs", ref: input.ref, direction: input.direction, limit: input.limit ?? 20 }, ctx.signal) }),
  defineMcpTool({ name: "spec_effects", description: "What a section, or one of its steps, may cause directly or through the algorithms it calls: queued tasks and microtasks and parallel steps (scheduling.*), events (event.*), script runs. Each effect lists where it occurs.", input: { ref, step: step.optional() }, run: (ctx, input) => ctx.webspec.lookup({ command: "effects", ref: input.ref, step: input.step ?? null }, ctx.signal) }),
  defineMcpTool({ name: "spec_flow", description: "The control flow of an algorithm as a mermaid chart: steps, branches, parallel steps and calls.", input: { ref }, run: (ctx, input) => ctx.webspec.lookup({ command: "flow", ref: input.ref }, ctx.signal) }),
  defineMcpTool({ name: "spec_state", description: 'Where a field or concept is declared, written and initialized, e.g. HTML#ongoing-navigation or "Document".', input: { selector: z.string() }, run: (ctx, input) => ctx.webspec.lookup({ command: "state", selector: input.selector }, ctx.signal) }),
];
