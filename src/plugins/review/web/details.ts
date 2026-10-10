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

export function backDetail(state: DetailsState): DetailsState {
  if (!state.back.length) return state;
  return { current: state.back[state.back.length - 1]!, back: state.back.slice(0, -1) };
}

export function closeDetails(): DetailsState { return { current: null, back: [] }; }

export const DetailsContext = createContext<{ current: Detail | null; open(detail: Detail): void } | null>(null);
