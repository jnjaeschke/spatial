import { Store } from "../../src/runtime/store.ts";
import { Runtime, type GitCapability, type RuntimeOptions } from "../../src/runtime/tasks.ts";
import type { LlmPrompt, LlmService } from "../../src/runtime/llm/types.ts";
import type { LlmSelection } from "../../src/shared/types.ts";

const fallbackSelection: LlmSelection = { backend: "claude", model: "sonnet", effort: "low" };

type SessionOptions = { worktree?: string; repoDir?: string; title?: string; workflow?: string };

/** Builds a runtime for tests and records prompts sent to its fake LLM. */
export function testRuntime<S extends SessionOptions | false = false>(options: Omit<RuntimeOptions, "store" | "llm" | "git"> & {
  store?: Store;
  llm?: LlmService;
  /** Default selection of the fake LLM. */
  selection?: LlmSelection;
  /** Provider session id of the n-th (0-based) LLM reply. */
  providerSessionId?: (call: number) => string | undefined;
  git?: RuntimeOptions["git"];
  reply?: (prompt: LlmPrompt, call: number) => unknown | Promise<unknown>;
  session?: S;
}): { rt: Runtime; store: Store; session: S extends false ? null : ReturnType<Store["createSession"]>; prompts: LlmPrompt[] } {
  const { store = new Store(":memory:"), llm: providedLlm, selection: defaultSelection = fallbackSelection, providerSessionId = () => "p", git, reply, session: sessionOptions = false as S, ...runtimeOptions } = options;
  const prompts: LlmPrompt[] = [];
  const llm = providedLlm ?? {
    defaultSelection,
    async run(selection, prompt) {
      prompts.push(prompt);
      const call = prompts.length - 1;
      if (!reply) throw new Error("unexpected LLM call");
      return { text: "", json: await reply(prompt, call), providerSessionId: providerSessionId(call), selection: selection ?? defaultSelection };
    },
    async listModels() { return { claude: { models: [] }, codex: { models: [] } }; },
  } as LlmService;
  const rt = new Runtime({ ...runtimeOptions, store, llm, git: git ?? (() => ({}) as GitCapability) });
  const session = (sessionOptions === false ? null : store.createSession({ worktree: sessionOptions.worktree ?? "/repo", repoDir: sessionOptions.repoDir ?? "/repo/.git", title: sessionOptions.title ?? "t", ...(sessionOptions.workflow ? { workflow: sessionOptions.workflow } : {}) })) as S extends false ? null : ReturnType<Store["createSession"]>;
  return { rt, store, session, prompts };
}
