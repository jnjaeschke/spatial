import { Store } from "../../src/runtime/store.ts";
import { Runtime, type GitCapability, type SearchfoxCapability, type WebspecCapability } from "../../src/runtime/tasks.ts";
import type { LlmPrompt, LlmService, McpServerSpec } from "../../src/runtime/llm/types.ts";
import type { CodeSearch } from "../../src/runtime/code-search.ts";
import { corePlugin } from "../../src/runtime/create.ts";
import { specPlugin } from "../../src/plugins/spec/index.ts";
import type { SpecAlgorithmData } from "../../src/plugins/spec/shared/types.ts";
import type { Artifact, Engine, Id } from "../../src/shared/types.ts";

/** A runtime with the spec plugin, the given code search, webspec fakes and session MCP servers, and an LLM answering each prompt with `reply(prompt)`. */
export function specRuntime(opts: { codeSearch?: Partial<Record<Engine, CodeSearch>>; webspec?: Partial<WebspecCapability>; sessionMcp?: (sessionId: Id) => Record<string, McpServerSpec>; reply?(prompt: LlmPrompt): unknown } = {}) {
  const prompts: LlmPrompt[] = [];
  const llm = {
    defaultSelection: { backend: "claude", model: "sonnet", effort: "low" },
    async run(selection, prompt) { prompts.push(prompt); return { text: "", json: await opts.reply?.(prompt), providerSessionId: "p", selection: selection ?? this.defaultSelection }; },
    async listModels() { return { claude: { models: [] }, codex: { models: [] } }; },
  } as LlmService;
  const rt = new Runtime({ store: new Store(":memory:"), plugins: [corePlugin, specPlugin], llm, git: () => ({}) as GitCapability, webspec: { refs: async () => ({ incoming: [], outgoing: [] }), idl: async () => [], analyze: async () => [], ...opts.webspec } as WebspecCapability, searchfox: {} as SearchfoxCapability, codeSearch: opts.codeSearch, sessionMcp: opts.sessionMcp });
  const session = rt.store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  return { rt, session, prompts };
}

/** Stores a `SpecAlgorithm` for `ref` (default a two-step `HTML#setup`) in the session. */
export function putAlgorithm(rt: Runtime, sessionId: string, ref = "HTML#setup", content = "1. Edit the line.\n2. Add the file."): Artifact<SpecAlgorithmData> {
  const [spec, anchor] = ref.split("#") as [string, string];
  return rt.store.putArtifact<SpecAlgorithmData>({ sessionId, type: "SpecAlgorithm", status: "verified", provenance: { taskId: "user" }, data: { ref, spec, anchor, title: anchor, type: "algorithm", url: `https://html.spec.whatwg.org/#${anchor}`, content, sha: `fake-${anchor}`, outgoingRefs: 0, effects: [], effectsStatus: { state: "ready", semantics: "may", issues: [], omitted: 0 }, stepEffects: {} } });
}
