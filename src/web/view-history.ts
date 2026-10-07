import { useEffect, useRef } from "react";
import type { ViewState } from "./view-state.ts";

/** A canvas view kept in a history entry, so Back and Forward return to where a jump started or landed. */
export interface HistoryView extends ViewState {
  focusedRow: { anchor: string; line: number } | null;
}

const JUMP = "spatial-ide:jump";
// Not exposed everywhere (e.g. a browser with the API disabled); without it jumps simply add no history entries.
const nav: Navigation | undefined = (globalThis as { navigation?: Navigation }).navigation;

/** Records the view in the current history entry. */
export function saveHistoryView(view: HistoryView): void {
  nav?.updateCurrentEntry({ state: view });
}

/** Keeps `from` in the current entry and pushes a same-document entry for the jump that follows. */
export function pushJump(from: HistoryView): void {
  if (!nav) return;
  saveHistoryView(from);
  // A newer jump aborts this one before it finishes; that is expected.
  nav.navigate(location.href, { history: "push", state: from, info: JUMP }).finished!.catch((error: DOMException) => { if (error.name !== "AbortError") throw error; });
}

/** Intercepts jump pushes and restores the stored view on traversal to one of their entries. */
export function useViewHistory(restore: (view: HistoryView) => void): void {
  const latest = useRef(restore);
  latest.current = restore;
  useEffect(() => {
    if (!nav) return;
    const onNavigate = (event: NavigateEvent) => {
      if (event.info === JUMP) {
        event.intercept({ focusReset: "manual", scroll: "manual" });
        return;
      }
      if (event.navigationType !== "traverse" || !event.destination.sameDocument) return;
      const view = event.destination.getState() as HistoryView | undefined;
      if (!view) return;
      event.intercept({ focusReset: "manual", scroll: "manual", handler: async () => latest.current(view) });
    };
    nav.addEventListener("navigate", onNavigate);
    return () => nav.removeEventListener("navigate", onNavigate);
  }, []);
}
