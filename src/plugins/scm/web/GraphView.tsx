import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { ErrorText, getJson, Segmented, useUrlParam, type RefRow } from "../../../web/plugin-api.ts";
import { relativeDate } from "../shared/relative-date.ts";
import { LaneCell, laneWidth, ROW_HEIGHT } from "./LaneCell.tsx";
import { RefPills } from "./RefPills.tsx";
import { RefsSidebar } from "./RefsSidebar.tsx";
import { setParams } from "./params.ts";
import { useLog, type LogView } from "./use-log.ts";

type Scope = "branches" | "all" | "current";
const SCOPES: { value: Scope; label: string; title: string }[] = [
  { value: "branches", label: "Branches", title: "Local branches and the remote default branch" },
  { value: "all", label: "All", title: "Every ref" },
  { value: "current", label: "Current branch", title: "Commits since the current branch left the default branch" },
];
/** Rows rendered beyond the visible ones on each side. */
const OVERSCAN = 15;
/** Jump gives up after this many pages (200 commits each). */
const MAX_JUMP_PAGES = 100;

export interface PanelProps { selected: string | null; compare: string | null; order: Map<string, number>; select(sha: string): void; close(): void }

/** A Git Graph-style commit list: lanes, ref pills, subject, author, date; windowed, loading pages as it scrolls. Selection lives in the URL (`commit`, `compare`). */
export function GraphView({ worktree, panel }: { worktree: string; panel?: (props: PanelProps) => ReactNode }) {
  const scope = (useUrlParam("scope") ?? "branches") as Scope;
  const selected = useUrlParam("commit");
  const compare = useUrlParam("compare");
  const log = useLog(worktree, scope);
  const [refs, setRefs] = useState<{ refs: RefRow[]; commitGraph: boolean } | null>(null);
  const [refsError, setRefsError] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 800 });
  const [jumpStatus, setJumpStatus] = useState<string | null>(null);
  const [jumpError, setJumpError] = useState<string | null>(null);
  const cancelJump = useRef(false);
  const list = useRef<HTMLDivElement>(null);
  const now = useMemo(() => Date.now(), [log.rows.length]);

  useEffect(() => {
    let cancelled = false;
    setRefs(null);
    setRefsError(null);
    getJson<{ refs: RefRow[]; commitGraph: boolean }>(`/api/scm/refs?repo=${encodeURIComponent(worktree)}`).then((value) => { if (!cancelled) setRefs(value); }, (e: Error) => { if (!cancelled) setRefsError(e.message); });
    return () => { cancelled = true; };
  }, [worktree]);
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewport({ top: element.scrollTop, height: element.clientHeight }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const refsBySha = useMemo(() => {
    const map = new Map<string, RefRow[]>();
    for (const ref of refs?.refs ?? []) map.set(ref.sha, [...(map.get(ref.sha) ?? []), ref]);
    return map;
  }, [refs]);
  const order = useMemo(() => new Map(log.rows.map((row, index) => [row.sha, index])), [log.rows]);
  const width = useMemo(() => laneWidth(log.lanes), [log.lanes]);
  const first = Math.max(0, Math.floor(viewport.top / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(log.rows.length, Math.ceil((viewport.top + viewport.height) / ROW_HEIGHT) + OVERSCAN);
  useEffect(() => { if (!log.done && !log.loading && !log.error && last > log.rows.length - 50) void log.loadMore(); }, [last, log]);

  const reveal = (index: number) => {
    const element = list.current;
    if (!element) return;
    const top = index * ROW_HEIGHT;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (top + ROW_HEIGHT > element.scrollTop + element.clientHeight) element.scrollTop = top + ROW_HEIGHT - element.clientHeight;
  };
  const select = (sha: string) => setParams({ commit: sha, compare: null });
  const close = () => setParams({ commit: null, compare: null });
  const onRowClick = (event: MouseEvent, sha: string) => {
    if ((event.ctrlKey || event.metaKey) && selected && selected !== sha) setParams({ compare: sha });
    else select(sha);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const current = selected === null ? -1 : order.get(selected) ?? -1;
    const next = Math.min(log.rows.length - 1, Math.max(0, current + (event.key === "ArrowDown" ? 1 : -1)));
    if (next < 0) return;
    select(log.rows[next]!.sha);
    reveal(next);
  };
  const jump = async (text: string) => {
    const wanted = text.trim();
    if (!wanted) return;
    const ref = refs?.refs.find((candidate) => candidate.name === wanted);
    const prefix = (ref?.sha ?? wanted).toLowerCase();
    if (!ref && !/^[0-9a-f]{4,64}$/.test(prefix)) { setJumpError(`Not a ref or commit: ${wanted}`); return; }
    cancelJump.current = false;
    setJumpError(null);
    let view: LogView = log;
    for (let pages = 0; ; pages++) {
      const index = view.rows.findIndex((row) => row.sha.startsWith(prefix));
      if (index >= 0) {
        setJumpStatus(null);
        select(view.rows[index]!.sha);
        requestAnimationFrame(() => reveal(index));
        return;
      }
      if (view.done || view.error || cancelJump.current || pages >= MAX_JUMP_PAGES) {
        setJumpStatus(null);
        if (!cancelJump.current) setJumpError(`${wanted} is not among this scope's first ${view.rows.length} commits`);
        return;
      }
      setJumpStatus(`Loading… ${view.rows.length} commits`);
      view = await log.loadMore();
    }
  };

  return <div className="scm-graph" data-testid="scm-view">
    {refs ? <RefsSidebar refs={refs.refs} worktree={worktree} onJump={(name) => void jump(name)} /> : <nav className="scm-sidebar" aria-label="Refs">{refsError ? <ErrorText error={refsError} /> : <p className="empty">Loading…</p>}</nav>}
    <section className="scm-main">
      <div className="scm-toolbar">
        <Segmented label="Scope" options={SCOPES} value={scope} onChange={(value) => setParams({ scope: value === "branches" ? null : value, commit: null, compare: null })} />
        <form onSubmit={(event) => { event.preventDefault(); void jump(new FormData(event.currentTarget).get("jump") as string); }}><input name="jump" type="search" aria-label="Jump to commit" placeholder="Jump to sha or ref" /></form>
        {jumpStatus && <><span className="count">{jumpStatus}</span><button type="button" onClick={() => { cancelJump.current = true; }}>Cancel</button></>}
        {jumpError && <span className="failed">{jumpError}</span>}
      </div>
      {refs && !refs.commitGraph && <p className="commit-graph-warning">This repository has no commit-graph file, so history loads slowly. Run <code>git commit-graph write --reachable</code>.</p>}
      <div className="scm-rows" ref={list} tabIndex={0} role="listbox" aria-label="Commits" onKeyDown={onKeyDown} onScroll={(event) => setViewport({ top: event.currentTarget.scrollTop, height: event.currentTarget.clientHeight })}>
        <div className="scm-rows-inner" style={{ height: log.rows.length * ROW_HEIGHT }}>
          {log.rows.slice(first, last).map((row, offset) => {
            const index = first + offset;
            return <div key={row.sha} role="option" aria-selected={row.sha === selected} data-testid="graph-row" data-sha={row.sha} className={`scm-row${row.sha === selected ? " selected" : ""}${row.sha === compare ? " compared" : ""}`} style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }} onClick={(event) => onRowClick(event, row.sha)}>
              <LaneCell row={log.lanes[index]!} width={width} />
              <RefPills refs={refsBySha.get(row.sha) ?? []} worktree={worktree} />
              <span className="subject" title={row.subject}>{row.subject}</span>
              <span className="author">{row.author}</span>
              <span className="date" title={new Date(row.date).toLocaleString()}>{relativeDate(row.date, now)}</span>
              <code className="sha">{row.sha.slice(0, 10)}</code>
            </div>;
          })}
        </div>
        {log.loading && <p className="count scm-loading">Loading…</p>}
        {log.error && <ErrorText error={log.error} />}
      </div>
    </section>
    {panel?.({ selected, compare, order, select, close })}
  </div>;
}
