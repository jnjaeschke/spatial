import { useCallback, useEffect, useRef, useState } from "react";
import { getJson, type LogRow } from "../../../web/plugin-api.ts";
import { EMPTY_LANES, layoutLanes, type LaneRow, type LaneState } from "../shared/lanes.ts";

const PAGE = 200;

export interface LogView { rows: LogRow[]; lanes: LaneRow[]; done: boolean; loading: boolean; error: string | null }
const EMPTY: LogView = { rows: [], lanes: [], done: false, loading: false, error: null };

/** The log of `scope` in pages of 200 with their lane layout. `loadMore` resolves with the view after the next page (or the current one when done); a page that arrives after the scope changed is dropped. */
export function useLog(worktree: string, scope: string): LogView & { loadMore(): Promise<LogView> } {
  const [view, setView] = useState<LogView>(EMPTY);
  const live = useRef<{ view: LogView; lanes: LaneState; generation: number; pending: Promise<LogView> | null }>({ view: EMPTY, lanes: EMPTY_LANES, generation: 0, pending: null });
  const loadMore = useCallback((): Promise<LogView> => {
    const current = live.current;
    if (current.pending) return current.pending;
    if (current.view.done || current.view.error) return Promise.resolve(current.view);
    const generation = current.generation;
    const skip = current.view.rows.length;
    current.view = { ...current.view, loading: true };
    setView(current.view);
    const update = (next: LogView) => {
      if (live.current.generation !== generation) return live.current.view;
      live.current.view = next;
      live.current.pending = null;
      setView(next);
      return next;
    };
    current.pending = getJson<LogRow[]>(`/api/scm/log?${new URLSearchParams({ repo: worktree, scope, skip: String(skip), limit: String(PAGE) })}`).then((page) => {
      if (live.current.generation !== generation) return live.current.view;
      const { rows, state } = layoutLanes(live.current.lanes, page);
      live.current.lanes = state;
      const before = live.current.view;
      return update({ rows: [...before.rows, ...page], lanes: [...before.lanes, ...rows], done: page.length < PAGE, loading: false, error: null });
    }, (e: Error) => update({ ...live.current.view, loading: false, error: e.message }));
    return current.pending;
  }, [worktree, scope]);
  useEffect(() => {
    live.current = { view: EMPTY, lanes: EMPTY_LANES, generation: live.current.generation + 1, pending: null };
    setView(EMPTY);
    void loadMore();
  }, [loadMore]);
  return { ...view, loadMore };
}
