import type { Id, LlmSelection } from "../shared/types.ts";
import { homedir } from "node:os";
import { join } from "node:path";
import { plugins } from "../plugins/index.ts";
import { chatTurn } from "../tasks/chat-turn/task.ts";
import { commandRunKind } from "./command-run.ts";
import { makeGit } from "./git/read.ts";
import { ClaudeBackend } from "./llm/claude.ts";
import { CodexBackend } from "./llm/codex.ts";
import { LlmManager } from "./llm/manager.ts";
import { Store } from "./store.ts";
import { pluginRegistry } from "./plugins.ts";
import { Runtime } from "./tasks.ts";
import { loadRepoContext } from "./repo-context.ts";
import { KnowledgeStore, knowledgeDbPath } from "./knowledge.ts";
import { fileURLToPath } from "node:url";
import type { McpServerSpec } from "./llm/types.ts";

export const DEFAULT_LLM: LlmSelection = { backend: "claude", model: "sonnet", effort: "medium" };
export const corePlugin = { id: "core", tasks: [chatTurn], artifactKinds: { CommandRun: commandRunKind } };

export function defaultDbPath(): string {
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "spatial", "runtime.sqlite");
}

/** The session MCP server: a stdio child reading the session database. It builds the plugin services from its environment, so the `SPATIAL_<TOOL>_BIN` variables set here are forwarded to it. */
export function sessionServerSpec(dbPath: string, sessionId: Id): McpServerSpec {
  const bins = Object.entries(process.env).filter((entry): entry is [string, string] => /^SPATIAL_\w+_BIN$/.test(entry[0]) && !!entry[1]);
  return { type: "stdio", command: process.execPath, args: [fileURLToPath(new URL("../mcp/session-server.ts", import.meta.url)), "--db", dbPath, "--session", sessionId], ...(bins.length ? { env: Object.fromEntries(bins) } : {}) };
}

/** The `spatial` MCP server in repo mode, for LLM work before a session exists. */
function repoServerSpec(repo: string): McpServerSpec {
  return { type: "stdio", command: process.execPath, args: [fileURLToPath(new URL("../mcp/session-server.ts", import.meta.url)), "--repo", repo] };
}

export function createRuntime(opts: {
  dbPath: string;
  defaultLlm?: LlmSelection;
  claudeBin?: string;
  codexBin?: string;
  codexHome?: string;
}): Runtime {
  const allPlugins = [corePlugin, ...plugins];
  const registry = pluginRegistry(allPlugins);
  const llm = new LlmManager(
    [new ClaudeBackend({ bin: opts.claudeBin, readOnlyCommands: registry.readOnlyCommands }), new CodexBackend({ bin: opts.codexBin, codexHome: opts.codexHome })],
    opts.defaultLlm ?? DEFAULT_LLM,
  );
  return new Runtime({
    store: new Store(opts.dbPath), plugins: allPlugins, llm, git: makeGit,
    repoContext: (repo) => loadRepoContext(repo, registry.deniedMcpServers),
    knowledge: new KnowledgeStore(knowledgeDbPath(opts.dbPath)),
    sessionMcp: opts.dbPath === ":memory:" ? undefined : (sessionId) => ({ spatial: sessionServerSpec(opts.dbPath, sessionId) }),
    repoMcp: (repo) => ({ spatial: repoServerSpec(repo) }),
  });
}
