import type { ZoomLevel } from "./graph.ts";

export interface ViewState {
  x: number;
  y: number;
  zoom: number;
  level: ZoomLevel;
  guideStep: number | null;
}

/** The user's viewport and guide position, kept per session in localStorage. */
export function readViewState(sessionId: string): ViewState | null {
  const value = localStorage.getItem(`spatial-ide:view:${sessionId}`);
  if (!value) return null;
  const parsed = JSON.parse(value) as ViewState;
  if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y) || !Number.isFinite(parsed.zoom)
    || !["patch", "concept", "code"].includes(parsed.level)
    || (parsed.guideStep !== null && (!Number.isInteger(parsed.guideStep) || parsed.guideStep < 0))) return null;
  return parsed;
}

export function saveViewState(sessionId: string, state: ViewState): void {
  localStorage.setItem(`spatial-ide:view:${sessionId}`, JSON.stringify(state));
}

export function clampGuideStep(step: number | null, count: number): number | null {
  if (step === null || count === 0) return null;
  return Math.min(step, count - 1);
}
