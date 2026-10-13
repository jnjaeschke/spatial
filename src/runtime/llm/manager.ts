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

  /** Keeps the default when its backend lists models; otherwise moves it to the first model of the first backend that does, at medium effort when offered. A user with only one of the CLIs installed then starts with a working selection. */
  async chooseDefault(): Promise<void> {
    const backends = await this.listModels();
    const own = backends[this.#default.backend];
    if (own && "models" in own) return;
    for (const [backend, listing] of Object.entries(backends) as [LlmBackendId, BackendModels][]) {
      const model = "models" in listing ? listing.models[0] : undefined;
      if (!model) continue;
      this.#default = { backend, model: model.id, effort: model.efforts.includes("medium") ? "medium" : model.efforts[0]! };
      return;
    }
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
