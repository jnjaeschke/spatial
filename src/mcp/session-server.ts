import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { Id } from "../shared/types.ts";
import { renderRef, sessionOverview, sessionView } from "../runtime/render-ref.ts";
import { pluginRegistry, type PluginRegistry } from "../runtime/plugins.ts";
import { corePlugin } from "../runtime/create.ts";
import { plugins } from "../plugins/index.ts";
import { Store } from "../runtime/store.ts";
import { readRepoSkill } from "../runtime/repo-context.ts";
import { scmBlame, scmBranches, scmDiff, scmFile, scmLog, scmMergeBase, scmShow, scmStatus } from "../runtime/git.ts";

// Codex refuses MCP tool calls without readOnlyHint, even with approval_policy=never.
const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;

function answer(produce: () => string) {
  try {
    return { content: [{ type: "text" as const, text: produce() }] };
  } catch (error) {
    return { content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }], isError: true };
  }
}

async function answerAsync(produce: () => Promise<string>) {
  try { return { content: [{ type: "text" as const, text: await produce() }] }; }
  catch (error) { return { content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }], isError: true }; }
}

export function createSessionServer(registry: PluginRegistry, store: Store, sessionId: Id, repoRoot: string): McpServer {
  const server = new McpServer({ name: "spatial", version: "1.0.0" });
  server.registerTool("session_overview", { description: "Summarize this session", inputSchema: {}, annotations }, async () => answer(() => sessionOverview(registry, sessionView(store, sessionId)).join("\n\n")));
  server.registerTool("get", { description: "Render a session artifact or subref", inputSchema: { ref: z.string() }, annotations }, async ({ ref }) => answer(() => renderRef(registry.artifactKinds, sessionView(store, sessionId), ref)));
  server.registerTool("read_skill", { description: "Return the full content of a repo skill by name", inputSchema: { name: z.string() }, annotations }, async ({ name }) => answer(() => readRepoSkill(repoRoot, name)));
  server.registerTool("search", {
    description: "Search this session's artifacts",
    inputSchema: {
      query: z.string(),
      kinds: z.array(z.enum(registry.searchKinds as [string, ...string[]])).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }, annotations,
  }, async ({ query, kinds, limit }) => answer(() => {
    const hits = store.search(sessionId, query, { kinds, limit });
    return hits.length ? hits.map((hit) => `${hit.ref} [${hit.kind}] ${hit.snippet}`).join("\n") : "No matches.";
  }));
  server.registerTool("scm_status", { description: "Show branch and working tree status", inputSchema: {}, annotations }, async () => answerAsync(() => scmStatus(repoRoot)));
  server.registerTool("scm_branches", { description: "List local branches", inputSchema: {}, annotations }, async () => answerAsync(() => scmBranches(repoRoot)));
  server.registerTool("scm_log", {
    description: "Show commits in a revision or range, newest first. Filter by `path`, by `search` (commits that add or remove that exact string, like git log -S) or by `regex` (commits whose diff touches a matching line, like git log -G). Searches over the whole history of a large repository are slow: give a `path` and a `limit`.",
    inputSchema: { range: z.string(), limit: z.number().int().min(1).max(500).optional(), path: z.string().optional(), search: z.string().optional(), regex: z.string().optional() }, annotations,
  }, async ({ range, ...opts }) => answerAsync(() => scmLog(repoRoot, range, opts)));
  server.registerTool("scm_blame", { description: "Show which commit last changed each line of a file at a revision (at most 400 lines)", inputSchema: { rev: z.string(), path: z.string(), start: z.number().int().min(1), end: z.number().int().min(1) }, annotations }, async ({ rev, path, start, end }) => answerAsync(() => scmBlame(repoRoot, rev, path, start, end)));
  server.registerTool("scm_merge_base", { description: "Find the common ancestor of two revisions", inputSchema: { a: z.string(), b: z.string() }, annotations }, async ({ a, b }) => answerAsync(() => scmMergeBase(repoRoot, a, b)));
  server.registerTool("scm_show", { description: "Show commit metadata and changed-file summary", inputSchema: { rev: z.string() }, annotations }, async ({ rev }) => answerAsync(() => scmShow(repoRoot, rev)));
  server.registerTool("scm_diff", { description: "Show the patch for a commit", inputSchema: { rev: z.string(), path: z.string().optional() }, annotations }, async ({ rev, path }) => answerAsync(() => scmDiff(repoRoot, rev, path)));
  server.registerTool("scm_file", { description: "Read numbered lines from a file at a revision", inputSchema: { rev: z.string(), path: z.string(), start: z.number().int().min(1).optional(), end: z.number().int().min(1).optional() }, annotations }, async ({ rev, path, start, end }) => answerAsync(() => scmFile(repoRoot, rev, path, start, end)));
  return server;
}

async function main(args: string[]): Promise<void> {
  const value = (name: string) => {
    const index = args.indexOf(name);
    if (index < 0 || !args[index + 1]) throw new Error(`Missing ${name}`);
    return args[index + 1]!;
  };
  const store = new Store(value("--db"), { readOnly: true });
  const sessionId = value("--session");
  const server = createSessionServer(pluginRegistry([corePlugin, ...plugins]), store, sessionId, store.getSession(sessionId).worktree);
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
