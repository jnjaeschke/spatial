import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Artifact } from "../shared/types.ts";
import type { Draft } from "./chat-context.ts";

export type InlineState = "line" | "preview" | "expanded";
const DEFAULT_STATE: InlineState = "preview";
type States = Record<string, InlineState>;

/** Stored item states; entries that are not a state are dropped. */
export function parseInlineStates(raw: string | null): States {
  let parsed: unknown;
  try { parsed = JSON.parse(raw ?? "{}"); } catch { return {}; }
  if (typeof parsed !== "object" || parsed === null) return {};
  return Object.fromEntries(Object.entries(parsed).filter(([, state]) => state === "line" || state === "expanded"));
}

/** `states` with `id` set; only non-default states are kept. */
export function withInlineState(states: States, id: string, state: InlineState): States {
  const { [id]: _, ...rest } = states;
  return state === DEFAULT_STATE ? rest : { ...rest, [id]: state };
}

/** `states` with the state of `from` moved to `to`. */
export function movedInlineState(states: States, from: string, to: string): States {
  const state = states[from];
  return state ? withInlineState(withInlineState(states, from, DEFAULT_STATE), to, state) : states;
}

/** The state an item shows: compact shows every item as a line. */
export function shownInlineState(states: States, id: string, compact: boolean): InlineState {
  return compact ? "line" : states[id] ?? DEFAULT_STATE;
}

/** Per-session state of inline items and the canvas-wide compact toggle, kept in localStorage. Setting an item's state ends compact. */
export function useInlineStates(sessionId: string) {
  const key = `spatial:inline:${sessionId}`;
  const compactKey = `spatial:inline-compact:${sessionId}`;
  const [states, setStates] = useState(() => parseInlineStates(localStorage.getItem(key)));
  const [compact, setCompactState] = useState(() => localStorage.getItem(compactKey) === "1");
  const update = useCallback((change: (current: States) => States) => setStates((current) => {
    const next = change(current);
    if (next !== current) localStorage.setItem(key, JSON.stringify(next));
    return next;
  }), [key]);
  const setCompact = useCallback((value: boolean) => { localStorage.setItem(compactKey, value ? "1" : "0"); setCompactState(value); }, [compactKey]);
  const set = useCallback((id: string, state: InlineState) => { update((current) => withInlineState(current, id, state)); setCompact(false); }, [update, setCompact]);
  const move = useCallback((from: string, to: string) => update((current) => movedInlineState(current, from, to)), [update]);
  return { state: (id: string) => shownInlineState(states, id, compact), set, move, compact, setCompact };
}

export type InlineStates = ReturnType<typeof useInlineStates>;
export const InlineStatesContext = createContext<InlineStates | null>(null);

export function useInlineState(id: string): [InlineState, (state: InlineState) => void] {
  const states = useContext(InlineStatesContext);
  if (!states) throw new Error("Inline items need InlineStatesContext");
  return [states.state(id), (state) => states.set(id, state)];
}

/** Opens each inline chat draft made after mount (its composer shows) and carries a draft's state to the thread it becomes once sent. */
export function useDraftInlineStates(inline: InlineStates, drafts: Draft[], artifacts: Artifact[]): void {
  const known = useRef(new Set(drafts.map((draft) => draft.id)));
  useEffect(() => {
    for (const draft of drafts) {
      if (known.current.has(draft.id)) continue;
      known.current.add(draft.id);
      if (!draft.aside) inline.set(draft.id, "expanded");
    }
  }, [drafts, inline.set]);
  useEffect(() => {
    for (const draft of drafts) {
      const thread = draft.taskId ? artifacts.find((artifact) => artifact.type === "ChatThread" && artifact.provenance.taskId === draft.taskId) : undefined;
      if (thread) inline.move(draft.id, thread.id);
    }
  }, [drafts, artifacts, inline.move]);
}
