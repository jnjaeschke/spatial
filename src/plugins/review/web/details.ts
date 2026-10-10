import { createContext } from "react";
import type { FileViewRequest } from "../../../web/plugin-api.ts";

/** What the review's details panel shows. */
export type Detail =
  | { kind: "file"; file: FileViewRequest }
  | { kind: "interdiff" }
  | { kind: "chat"; id: string }
  | { kind: "comment"; id: string }
  | { kind: "finding"; id: string }
  | { kind: "phab"; anchorId: string }
  | { kind: "spec"; specId: string }
  | { kind: "symbol"; name: string };

/** The shown detail and up to twenty details that Back can restore. */
export interface DetailsState { current: Detail | null; back: Detail[] }

export function openDetail(state: DetailsState, detail: Detail): DetailsState {
  if (JSON.stringify(state.current) === JSON.stringify(detail)) return state;
  return { current: detail, back: state.current ? [...state.back, state.current].slice(-20) : state.back };
}

/** Restores the most recent item that still `resolves`; closes the panel when none does. */
export function backDetail(state: DetailsState, resolves: (detail: Detail) => boolean = () => true): DetailsState {
  const index = state.back.findLastIndex(resolves);
  return index < 0 ? closeDetails() : { current: state.back[index]!, back: state.back.slice(0, index) };
}

export function canGoBack(state: DetailsState, resolves: (detail: Detail) => boolean): boolean {
  return state.back.some(resolves);
}

export function closeDetails(): DetailsState { return { current: null, back: [] }; }

export const DetailsContext = createContext<{ current: Detail | null; open(detail: Detail): void } | null>(null);
