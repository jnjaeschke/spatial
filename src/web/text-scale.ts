import { useSyncExternalStore } from "react";

export const TEXT_SCALES = [0.9, 1, 1.15, 1.3, 1.45, 1.6] as const;
export const DEFAULT_TEXT_SCALE = 1;

const KEY = "spatial.textScale";
const CHANGE = "spatial-text-scale-change";

export function parseTextScale(raw: string | null): number {
  const value = Number(raw);
  return raw !== null && (TEXT_SCALES as readonly number[]).includes(value) ? value : DEFAULT_TEXT_SCALE;
}

export function stepTextScale(current: number, direction: -1 | 1): number {
  const found = (TEXT_SCALES as readonly number[]).indexOf(current);
  const index = found < 0 ? TEXT_SCALES.indexOf(DEFAULT_TEXT_SCALE) : found;
  return TEXT_SCALES[Math.min(TEXT_SCALES.length - 1, Math.max(0, index + direction))]!;
}

export function textScale(): number {
  return parseTextScale(localStorage.getItem(KEY));
}

export function applyTextScale(scale: number = textScale()): void {
  document.documentElement.style.setProperty("--text-scale", String(scale));
}

export function setTextScale(scale: number): void {
  if (scale === DEFAULT_TEXT_SCALE) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, String(scale));
  applyTextScale(scale);
  window.dispatchEvent(new Event(CHANGE));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE, onChange);
  return () => window.removeEventListener(CHANGE, onChange);
}

export function useTextScale(): number {
  return useSyncExternalStore(subscribe, textScale);
}
