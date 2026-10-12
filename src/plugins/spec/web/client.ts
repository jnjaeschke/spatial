import type { SpecOpenedData, SpecTraceData } from "../shared/types.ts";
import type { SummaryView } from "../runtime/summaries.ts";
import type { EngineMapping } from "../shared/types.ts";
import type { Engine } from "../../../plugin-api.ts";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `${res.status} ${res.statusText}`);
  return json as T;
}

/** HTTP calls of the spec explorer. */
export const specClient = {
  summaries: (sessionId: string) => fetch(`/api/sessions/${sessionId}/spec/summaries`).then(async (res) => { if (!res.ok) throw new Error(`${res.status} ${res.statusText}`); return await res.json() as Record<string, SummaryView>; }),
  mappings: (sessionId: string, engine: Engine) => fetch(`/api/sessions/${sessionId}/spec/mappings?engine=${engine}`).then(async (res) => { if (!res.ok) throw new Error(`${res.status} ${res.statusText}`); return await res.json() as Record<string, EngineMapping | null>; }),
  findImplementation: (sessionId: string, ref: string, engine: Engine, stale: string | null) => post<{ taskId: string }>(`/api/sessions/${sessionId}/spec/mappings/find`, { ref, engine, stale }),
  decideImplementation: (sessionId: string, ref: string, engine: Engine, key: string, decision: "confirm" | "reject") => post<{ entryId: string }>(`/api/sessions/${sessionId}/spec/mappings/decide`, { ref, engine, key, decision }),
  alignSteps: (sessionId: string, ref: string, engine: Engine, key: string) => post<{ taskId: string }>(`/api/sessions/${sessionId}/spec/mappings/align`, { ref, engine, key }),
  flagSummary: (sessionId: string, ref: string) => post<{ entryId: string }>(`/api/sessions/${sessionId}/spec/summaries/flag`, { ref }),
  open: (sessionId: string, anchor: string, from: SpecOpenedData["from"]) => post<{ openedId: string }>(`/api/sessions/${sessionId}/spec/open`, { anchor, from }),
  showEffectPath: (sessionId: string, ref: string, effectId: string) => post<{ opened: number }>(`/api/sessions/${sessionId}/spec/effect-path`, { ref, effectId }),
  saveTrace: (sessionId: string, trace: SpecTraceData) => post<{ artifactId: string }>(`/api/sessions/${sessionId}/spec/traces`, { trace }),
  explore: (sessionId: string, requestId: string) => post<{ opened: number }>(`/api/sessions/${sessionId}/spec/explore`, { requestId }),
};
