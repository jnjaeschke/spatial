import type { Engine, LlmSelection } from "../shared/types.ts";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { plugins } from "../plugins/index.ts";
import { chatTurn } from "../tasks/chat-turn/task.ts";
import { selectWorkflow } from "../tasks/select-workflow/task.ts";
import { makeGit } from "./git.ts";
import { ClaudeBackend } from "./llm/claude.ts";
import { CodexBackend } from "./llm/codex.ts";
import { LlmManager } from "./llm/manager.ts";
import { Store } from "./store.ts";
import { Runtime } from "./tasks.ts";
import { loadRepoContext } from "./repo-context.ts";
import { makeSearchfox } from "./searchfox.ts";
import { searchfoxCodeSearch } from "./searchfox.ts";
import { makeChromiumSearch } from "./chromium-search.ts";
import type { SearchfoxCapability } from "./tasks.ts";
import type { CodeSearch } from "./code-search.ts";
import { makeWebspec } from "./webspec.ts";
import { KnowledgeStore } from "./knowledge.ts";
import { fileURLToPath } from "node:url";

export const DEFAULT_LLM: LlmSelection = { backend: "claude", model: "sonnet", effort: "medium" };
export const corePlugin = { id: "core", tasks: [chatTurn, selectWorkflow] };

export function defaultDbPath(): string {
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "spatial", "runtime.sqlite");
}

/** The code search of every engine: Gecko over `searchfox`, WebKit over searchfox's `wubkat` repository, Blink over chromium-search. */
export function makeCodeSearch(searchfox: SearchfoxCapability, bins: { searchfoxBin?: string; chromiumSearchBin?: string }): Record<Engine, CodeSearch> {
  return { gecko: searchfoxCodeSearch("gecko", searchfox), webkit: searchfoxCodeSearch("webkit", makeSearchfox({ bin: bins.searchfoxBin, repo: "wubkat" })), blink: makeChromiumSearch({ bin: bins.chromiumSearchBin }) };
}

export function createRuntime(opts: {
  dbPath: string;
  defaultLlm?: LlmSelection;
  claudeBin?: string;
  codexBin?: string;
  codexHome?: string;
  webspecBin?: string;
  searchfoxBin?: string;
  chromiumSearchBin?: string;
}): Runtime {
  const llm = new LlmManager(
    [new ClaudeBackend({ bin: opts.claudeBin }), new CodexBackend({ bin: opts.codexBin, codexHome: opts.codexHome })],
    opts.defaultLlm ?? DEFAULT_LLM,
  );
  const searchfox = makeSearchfox({ bin: opts.searchfoxBin });
  return new Runtime({
    store: new Store(opts.dbPath), plugins: [corePlugin, ...plugins], llm, git: makeGit,
    webspec: makeWebspec({ bin: opts.webspecBin }), searchfox, codeSearch: makeCodeSearch(searchfox, { searchfoxBin: opts.searchfoxBin, chromiumSearchBin: opts.chromiumSearchBin }),
    repoContext: loadRepoContext,
    knowledge: new KnowledgeStore(opts.dbPath === ":memory:" ? ":memory:" : join(dirname(opts.dbPath), "knowledge.db")),
    sessionMcp: opts.dbPath === ":memory:" ? undefined : (sessionId) => ({ spatial: {
      type: "stdio",
      command: process.execPath,
      args: [fileURLToPath(new URL("../mcp/session-server.ts", import.meta.url)), "--db", opts.dbPath, "--session", sessionId],
    } }),
  });
}
