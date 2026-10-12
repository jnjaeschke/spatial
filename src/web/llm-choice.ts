import type { LlmSelection, ModelsResponse } from "../shared/types.ts";

const KEY = "spatial:last-model";
const CHANGED = "spatial:last-model-changed";

/** `models` with the stored last-used selection as `default` when the models still offer that backend, model and effort. */
export function withLastUsed(models: ModelsResponse, stored: string | null): ModelsResponse {
  let llm: Partial<LlmSelection> | null;
  try { llm = JSON.parse(stored ?? "null") as Partial<LlmSelection> | null; } catch { return models; }
  const backend = llm?.backend && models.backends[llm.backend];
  const model = backend && "models" in backend ? backend.models.find((m) => m.id === llm!.model) : undefined;
  return model && model.efforts.includes(llm!.effort!) ? { ...models, default: llm as LlmSelection } : models;
}

/** Records `llm` as the last-used selection; mounted `useModels` users rerender with it as their default. */
export function rememberLlm(llm: LlmSelection): void {
  localStorage.setItem(KEY, JSON.stringify(llm));
  dispatchEvent(new Event(CHANGED));
}

export function subscribeLastUsed(onChange: () => void): () => void {
  addEventListener(CHANGED, onChange);
  addEventListener("storage", onChange);
  return () => { removeEventListener(CHANGED, onChange); removeEventListener("storage", onChange); };
}
export const readLastUsed = () => localStorage.getItem(KEY);
