import type { BackendModels, LlmBackendId, LlmSelection } from "../../shared/types.ts";
import type { LlmBackend, LlmPrompt, LlmRunResult, LlmService } from "./types.ts";

export class LlmManager implements LlmService {
  #backends = new Map<LlmBackendId, LlmBackend>();
  #default: LlmSelection;

  constructor(backends: LlmBackend[], defaultSelection: LlmSelection) {
    for (const b of backends) this.#backends.set(b.id, b);
    this.#default = defaultSelection;
  }

  get defaultSelection(): LlmSelection {
    return this.#default;
  }

  async run(selection: LlmSelection | undefined, prompt: LlmPrompt, signal: AbortSignal): Promise<LlmRunResult> {
    const sel = selection ?? this.#default;
    const backend = this.#backends.get(sel.backend);
    if (!backend) throw new Error(`Unknown LLM backend: ${sel.backend}`);
    const r = await backend.run({ ...prompt, model: sel.model, effort: sel.effort, signal });
    return { ...r, selection: sel };
  }

  async listModels(): Promise<Record<LlmBackendId, BackendModels>> {
    const out = {} as Record<LlmBackendId, BackendModels>;
    for (const [id, b] of this.#backends) {
      try {
        out[id] = { models: await b.listModels() };
      } catch (e) {
        out[id] = { error: (e as Error).message };
      }
    }
    return out;
  }
}
