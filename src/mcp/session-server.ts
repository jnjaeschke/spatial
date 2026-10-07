import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { Id } from "../shared/types.ts";
import { renderRef, sessionOverview, sessionView } from "../runtime/render-ref.ts";
import { Store } from "../runtime/store.ts";
import { readRepoSkill } from "../runtime/repo-context.ts";
import { scmBranches, scmLog, scmMergeBase, scmShow, scmStatus } from "../runtime/git.ts";

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

export function createSessionServer(store: Store, sessionId: Id, repoRoot: string): McpServer {
  const server = new McpServer({ name: "spatial", version: "1.0.0" });
  server.registerTool("session_overview", { description: "Summarize this session", inputSchema: {}, annotations }, async () => answer(() => sessionOverview(sessionView(store, sessionId))));
  server.registerTool("get", { description: "Render a session artifact or subref", inputSchema: { ref: z.string() }, annotations }, async ({ ref }) => answer(() => renderRef(sessionView(store, sessionId), ref)));
  server.registerTool("read_skill", { description: "Return the full content of a repo skill by name", inputSchema: { name: z.string() }, annotations }, async ({ name }) => answer(() => readRepoSkill(repoRoot, name)));
  server.registerTool("search", {
    description: "Search this session's artifacts",
    inputSchema: {
      query: z.string(),
      kinds: z.array(z.enum(["change", "summary", "hunk", "commit", "spec", "chat", "finding", "comment"])).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }, annotations,
  }, async ({ query, kinds, limit }) => answer(() => {
    const hits = store.search(sessionId, query, { kinds, limit });
    return hits.length ? hits.map((hit) => `${hit.ref} [${hit.kind}] ${hit.snippet}`).join("\n") : "No matches.";
  }));
  server.registerTool("scm_status", { description: "Show branch and working tree status", inputSchema: {}, annotations }, async () => answerAsync(() => scmStatus(repoRoot)));
  server.registerTool("scm_branches", { description: "List local branches", inputSchema: {}, annotations }, async () => answerAsync(() => scmBranches(repoRoot)));
  server.registerTool("scm_log", { description: "Show commits in a revision or range, newest first", inputSchema: { range: z.string(), limit: z.number().int().min(1).max(500).optional() }, annotations }, async ({ range, limit }) => answerAsync(() => scmLog(repoRoot, range, limit)));
  server.registerTool("scm_merge_base", { description: "Find the common ancestor of two revisions", inputSchema: { a: z.string(), b: z.string() }, annotations }, async ({ a, b }) => answerAsync(() => scmMergeBase(repoRoot, a, b)));
  server.registerTool("scm_show", { description: "Show commit metadata and changed-file summary", inputSchema: { rev: z.string() }, annotations }, async ({ rev }) => answerAsync(() => scmShow(repoRoot, rev)));
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
  const server = createSessionServer(store, sessionId, store.getSession(sessionId).worktree);
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
