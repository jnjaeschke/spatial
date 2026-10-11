export interface ViewState {
  x: number;
  y: number;
  zoom: number;
  /** The canvas place shown; null for canvases without places. */
  place: string | null;
  guideStep: number | null;
}

/** A `ViewState` from untrusted data (storage or a history entry), or null when it has the wrong shape. */
export function parseViewState(value: unknown): ViewState | null {
  if (typeof value !== "object" || value === null) return null;
  const parsed = value as ViewState;
  if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y) || !Number.isFinite(parsed.zoom)
    || (parsed.place !== null && typeof parsed.place !== "string")
    || (parsed.guideStep !== null && (!Number.isInteger(parsed.guideStep) || parsed.guideStep < 0))) return null;
  return parsed;
}

/** The user's viewport and guide position, kept per session in localStorage. */
export function readViewState(sessionId: string): ViewState | null {
  const value = localStorage.getItem(`spatial-ide:view:${sessionId}`);
  return value ? parseViewState(JSON.parse(value)) : null;
}

export function saveViewState(sessionId: string, state: ViewState): void {
  localStorage.setItem(`spatial-ide:view:${sessionId}`, JSON.stringify(state));
}

export function clampGuideStep(step: number | null, count: number): number | null {
  if (step === null || count === 0) return null;
  return Math.min(step, count - 1);
}
