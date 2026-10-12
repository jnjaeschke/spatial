import { getJson as get, postJson as post } from "../../../web/plugin-api.ts";
import type { SpecOpenedData, SpecTraceData, TraceCodeRef, TraceQuestion } from "../shared/types.ts";
import type { SummaryView } from "../runtime/summaries.ts";
import type { EngineMapping } from "../shared/types.ts";
import type { Engine } from "../../../plugin-api.ts";
import type { ImplementationsData } from "../shared/types.ts";

/** HTTP calls of the spec explorer. */
export const specClient = {
  implementations: (sessionId: string, ref: string) => get<ImplementationsData>(`/api/sessions/${sessionId}/spec/implementations?ref=${encodeURIComponent(ref)}`),
  ensureMappings: (sessionId: string, ref: string) => post<Record<string, never>>(`/api/sessions/${sessionId}/spec/mappings/ensure`, { ref }),
  summaries: (sessionId: string) => get<Record<string, SummaryView>>(`/api/sessions/${sessionId}/spec/summaries`),
  mappings: (sessionId: string, engine: Engine) => get<Record<string, EngineMapping | null>>(`/api/sessions/${sessionId}/spec/mappings?engine=${engine}`),
  code: (sessionId: string, engine: Engine, path: string, line: number, quote: string | null) => get<{ start: number; at: number | null; lines: string[] }>(`/api/sessions/${sessionId}/spec/code?${new URLSearchParams({ engine, path, line: String(line), ...(quote ? { quote } : {}) })}`),
  findImplementation: (sessionId: string, ref: string, engine: Engine, stale: string | null) => post<{ taskId: string }>(`/api/sessions/${sessionId}/spec/mappings/find`, { ref, engine, stale }),
  decideImplementation: (sessionId: string, ref: string, engine: Engine, key: string, decision: "confirm" | "reject") => post<{ entryId: string }>(`/api/sessions/${sessionId}/spec/mappings/decide`, { ref, engine, key, decision }),
  addMappingStep: (sessionId: string, proposal: { ref: string; step: string; code: TraceCodeRef }) => post<{ entryId: string }>(`/api/sessions/${sessionId}/spec/mappings/steps`, proposal),
  alignSteps: (sessionId: string, ref: string, engine: Engine, key: string) => post<{ taskId: string }>(`/api/sessions/${sessionId}/spec/mappings/align`, { ref, engine, key }),
  compareEngines: (sessionId: string, ref: string) => post<{ taskId: string }>(`/api/sessions/${sessionId}/spec/mappings/compare`, { ref }),
  flagDifference: (sessionId: string, ref: string, entryId: string, index: number) => post<Record<string, never>>(`/api/sessions/${sessionId}/spec/mappings/compare/flag`, { ref, entryId, index }),
  flagSummary: (sessionId: string, ref: string) => post<{ entryId: string }>(`/api/sessions/${sessionId}/spec/summaries/flag`, { ref }),
  open: (sessionId: string, anchor: string, from: SpecOpenedData["from"]) => post<{ openedId: string }>(`/api/sessions/${sessionId}/spec/open`, { anchor, from }),
  showEffectPath: (sessionId: string, ref: string, effectId: string) => post<{ opened: number }>(`/api/sessions/${sessionId}/spec/effect-path`, { ref, effectId }),
  saveTrace: (sessionId: string, trace: SpecTraceData) => post<{ artifactId: string }>(`/api/sessions/${sessionId}/spec/traces`, { trace }),
  explore: (sessionId: string, requestId: string) => post<{ opened: number; traceId: string | null }>(`/api/sessions/${sessionId}/spec/explore`, { requestId }),
  ask: (sessionId: string, request: { mode: TraceQuestion["mode"]; question: string; anchors: string[]; contextTraceId: string | null }) => post<{ traceId: string }>(`/api/sessions/${sessionId}/spec/ask`, request),
  recheckTrace: (sessionId: string, traceId: string) => post<{ traceArtifactId: string }>(`/api/sessions/${sessionId}/spec/traces/${encodeURIComponent(traceId)}/check`, {}),
  openTrace: (sessionId: string, traceId: string) => post<{ opened: number }>(`/api/sessions/${sessionId}/spec/traces/${encodeURIComponent(traceId)}/open`, {}),
};
