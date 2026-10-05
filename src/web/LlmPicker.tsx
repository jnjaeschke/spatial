import type { LlmBackendId, LlmSelection, ModelsResponse } from "../shared/types.ts";

export function LlmPicker({ models, value, onChange }: { models: ModelsResponse; value: LlmSelection; onChange: (s: LlmSelection) => void }) {
  const backendModels = (b: LlmBackendId) => {
    const r = models.backends[b];
    return "models" in r ? r.models : [];
  };
  const current = backendModels(value.backend);
  const efforts = current.find((m) => m.id === value.model)?.efforts ?? [];
  const pickModel = (backend: LlmBackendId, modelId: string) => {
    const m = backendModels(backend).find((x) => x.id === modelId);
    const effort = m?.efforts.includes(value.effort) ? value.effort : (m?.efforts.includes("medium") ? "medium" : (m?.efforts[0] ?? value.effort));
    onChange({ backend, model: modelId, effort });
  };
  return <span className="llm-picker">
    <select aria-label="backend" value={value.backend} onChange={(e) => {
      const b = e.target.value as LlmBackendId;
      pickModel(b, backendModels(b)[0]?.id ?? "");
    }}>
      {(Object.keys(models.backends) as LlmBackendId[]).map((b) => {
        const r = models.backends[b];
        return <option key={b} value={b} disabled={"error" in r} title={"error" in r ? r.error : undefined}>{b}</option>;
      })}
    </select>
    <select aria-label="model" value={value.model} onChange={(e) => pickModel(value.backend, e.target.value)}>
      {current.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
    </select>
    <select aria-label="effort" value={value.effort} onChange={(e) => onChange({ ...value, effort: e.target.value })}>
      {efforts.map((x) => <option key={x} value={x}>{x}</option>)}
    </select>
  </span>;
}
