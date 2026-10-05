import type { LlmSelection } from "../shared/types.ts";
import { homedir } from "node:os";
import { join } from "node:path";
import { tasks } from "../tasks/index.ts";
import { makeGit } from "./git.ts";
import { ClaudeBackend } from "./llm/claude.ts";
import { CodexBackend } from "./llm/codex.ts";
import { LlmManager } from "./llm/manager.ts";
import { Store } from "./store.ts";
import { Runtime } from "./tasks.ts";

export const DEFAULT_LLM: LlmSelection = { backend: "claude", model: "sonnet", effort: "medium" };

export function defaultDbPath(): string {
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "spatial-ide", "runtime.sqlite");
}

export function createRuntime(opts: {
  dbPath: string;
  defaultLlm?: LlmSelection;
  claudeBin?: string;
  codexBin?: string;
  codexHome?: string;
}): Runtime {
  const llm = new LlmManager(
    [new ClaudeBackend({ bin: opts.claudeBin }), new CodexBackend({ bin: opts.codexBin, codexHome: opts.codexHome })],
    opts.defaultLlm ?? DEFAULT_LLM,
  );
  return new Runtime({ store: new Store(opts.dbPath), tasks, llm, git: makeGit });
}
