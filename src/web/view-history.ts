import { useEffect, useRef } from "react";
import { parseViewState, type ViewState } from "./view-state.ts";
import { parseRoute } from "./routes.ts";

/** A canvas view kept in a history entry, so Back and Forward return to where a jump started or landed. */
export interface HistoryView extends ViewState {
  focusedRow: { anchor: string; side: "new" | "old"; line: number } | null;
  /** What the history menus show for the entry. */
  label: string;
}

const JUMP = "spatial:jump";
const RECENT_LIMIT = 15;

/** A `HistoryView` from a history entry's state, which crosses reloads; null when it has the wrong shape. */
export function parseHistoryView(value: unknown): HistoryView | null {
  const base = parseViewState(value);
  if (!base) return null;
  const { focusedRow, label } = value as HistoryView;
  if (typeof label !== "string") return null;
  if (focusedRow !== null && (typeof focusedRow !== "object" || focusedRow === null || typeof focusedRow.anchor !== "string" || (focusedRow.side !== "new" && focusedRow.side !== "old") || !Number.isInteger(focusedRow.line))) return null;
  return value as HistoryView;
}

/** The labelled entries of a session as a Recent menu shows them: newest first, one per URL and label, at most 15; the current entry is always listed. */
export function recentEntries(entries: { key: string; url: string; state: unknown }[], currentIndex: number, sessionId: string): { key: string; label: string; current: boolean }[] {
  const identity = (entry: { url: string }, view: HistoryView) => `${entry.url}\n${view.label}`;
  const seen = new Set<string>();
  const current = entries[currentIndex];
  const currentView = current && parseHistoryView(current.state);
  if (current && currentView) seen.add(identity(current, currentView));
  const recent: { key: string; label: string; current: boolean }[] = [];
  for (let index = entries.length - 1; index >= 0 && recent.length < RECENT_LIMIT; index--) {
    const entry = entries[index]!;
    const route = parseRoute(new URL(entry.url));
    const view = parseHistoryView(entry.state);
    if (route?.kind !== "session" || route.sessionId !== sessionId || !view || !view.label) continue;
    if (index !== currentIndex) {
      if (seen.has(identity(entry, view))) continue;
      seen.add(identity(entry, view));
    }
    recent.push({ key: entry.key, label: view.label, current: index === currentIndex });
  }
  return recent;
}

/** Records the view in the current history entry. */
export function saveHistoryView(view: HistoryView): void {
  navigation.updateCurrentEntry({ state: view });
}

// A newer jump aborts this one before it finishes; that is expected.
function jump(url: string, options: NavigationNavigateOptions): void {
  navigation.navigate(url, { ...options, info: JUMP }).finished!.catch((error: DOMException) => { if (error.name !== "AbortError") throw error; });
}

/** Keeps `from` in the current entry and pushes a same-document entry, at `url` when given, for the jump that follows. */
export function pushJump(from: HistoryView, url?: string): void {
  saveHistoryView(from);
  jump(url ?? location.href, { history: "push", state: from });
}

/** Replaces the current entry's URL, keeping its state. */
export function replaceUrl(url: string): void {
  jump(url, { history: "replace", state: navigation.currentEntry?.getState() });
}

/**
 * Intercepts jump pushes and calls `restore` on traversal. `view` is the destination entry's state; `place` is the
 * place of its URL (null when the URL has none). With a `sessionId`, only entries of that session are handled and
 * entries without state are too; without it only entries with state.
 */
export function useViewHistory(sessionId: string | null, restore: (view: HistoryView | null, place: string | null) => void): void {
  const latest = useRef(restore);
  latest.current = restore;
  useEffect(() => {
    const onNavigate = (event: NavigateEvent) => {
      if (event.info === JUMP) {
        event.intercept({ focusReset: "manual", scroll: "manual" });
        return;
      }
      if (event.navigationType !== "traverse" || !event.destination.sameDocument) return;
      const view = parseHistoryView(event.destination.getState());
      let place: string | null = view?.place ?? null;
      if (sessionId !== null) {
        const route = parseRoute(new URL(event.destination.url));
        if (route?.kind !== "session" || route.sessionId !== sessionId) return;
        place = route.place;
      } else if (!view) return;
      event.intercept({ focusReset: "manual", scroll: "manual", handler: async () => latest.current(view, place) });
    };
    navigation.addEventListener("navigate", onNavigate);
    return () => navigation.removeEventListener("navigate", onNavigate);
  }, [sessionId]);
}
