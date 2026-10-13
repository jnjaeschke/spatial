import { Store } from "../../../src/runtime/store.ts";
import { type Runtime } from "../../../src/runtime/tasks.ts";
import type { WebspecCapability } from "../../../src/plugins/spec/runtime/webspec.ts";
import type { LlmPrompt, McpServerSpec } from "../../../src/runtime/llm/types.ts";
import type { CodeSearch } from "../../../src/plugins/spec/runtime/code-search.ts";
import { corePlugin } from "../../../src/runtime/create.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";
import type { SpecAlgorithmData } from "../../../src/plugins/spec/shared/types.ts";
import type { Artifact, Id } from "../../../src/shared/types.ts";
import type { Engine } from "../../../src/plugins/spec/shared/types.ts";
import { specTestServices } from "../../helpers/spec-services.ts";
import { testRuntime } from "../../helpers/runtime.ts";

/** A runtime with the spec plugin, the given code search, webspec fakes and session MCP servers, and an LLM answering each prompt with `reply(prompt)`. */
export function specRuntime(opts: { codeSearch?: Partial<Record<Engine, CodeSearch>>; webspec?: Partial<WebspecCapability>; sessionMcp?: (sessionId: Id) => Record<string, McpServerSpec>; reply?(prompt: LlmPrompt): unknown } = {}) {
  const { rt, session, prompts } = testRuntime({ plugins: [corePlugin, specPlugin], store: new Store(":memory:"), reply: opts.reply, services: specTestServices({ webspec: { refs: async () => ({ incoming: [], outgoing: [] }), idl: async () => [], analyze: async () => [], ...opts.webspec }, codeSearch: opts.codeSearch }), sessionMcp: opts.sessionMcp, session: { worktree: "/repo", repoDir: "/repo/.git", title: "t" } });
  if (!session) throw new Error("spec runtime session missing");
  return { rt, session, prompts };
}

/** Stores a `SpecAlgorithm` for `ref` (default a two-step `HTML#setup`) in the session. */
export function putAlgorithm(rt: Runtime, sessionId: string, ref = "HTML#setup", content = "1. Edit the line.\n2. Add the file."): Artifact<SpecAlgorithmData> {
  const [spec, anchor] = ref.split("#") as [string, string];
  return rt.store.putArtifact<SpecAlgorithmData>({ sessionId, type: "SpecAlgorithm", status: "verified", provenance: { taskId: "user" }, data: { ref, spec, anchor, title: anchor, type: "algorithm", url: `https://html.spec.whatwg.org/#${anchor}`, content, sha: `fake-${anchor}`, outgoingRefs: 0, effects: [], effectsStatus: { state: "ready", semantics: "may", issues: [], omitted: 0 }, stepEffects: {} } });
}
