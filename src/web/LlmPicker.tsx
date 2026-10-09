import type { ReactNode } from "react";
import type { LlmBackendId, LlmSelection, ModelsResponse } from "../shared/types.ts";

/** Backend, model and effort selects; `labeled` adds visible labels (for roomy places like the start box). */
export function LlmPicker({ models, value, onChange, labeled = false }: { models: ModelsResponse; value: LlmSelection; onChange: (s: LlmSelection) => void; labeled?: boolean }) {
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
  const field = (label: string, control: ReactNode) => labeled ? <label className="field"><span className="field-label">{label}</span>{control}</label> : control;
  return <span className="llm-picker">
    {field("Model", <><select aria-label="backend" value={value.backend} onChange={(e) => {
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
    </select></>)}
    {field("Effort", <select aria-label="effort" value={value.effort} onChange={(e) => onChange({ ...value, effort: e.target.value })}>
      {efforts.map((x) => <option key={x} value={x}>{x}</option>)}
    </select>)}
  </span>;
}
