import { Fragment, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Artifact, DiffData } from "../../../web/plugin-api.ts";
import { fileRows, numberLines, type Row } from "../shared/diff-lines.ts";
import { loadFileLines } from "../../../web/plugin-api.ts";
import { StackContext } from "./stack-context.ts";
import { RowPainter, rowSegments } from "../../../web/plugin-api.ts";
import { commitColors, commitLabel } from "./commit-colors.ts";
import type { HunkRow } from "../../../web/plugin-api.ts";
import { FileViewContext } from "../../../web/plugin-api.ts";
export { FileViewContext } from "../../../web/plugin-api.ts";

export interface OpenFile {
  diffId: string;
  path: string;
  hunkId: string;
  text?: string;
}

const SIGN = { ctx: " ", add: "+", del: "-" } as const;

/** `oldHref` links old-side line numbers (e.g. to Searchfox). */
/** Rows without a `diffId` carry no `data-anchor`, so selecting them offers no Ask. `rowClass` adds classes to a row. */
export function DiffRows({ rows, hunkId, diffId, path, oldHref, afterRow, onRowClick, rowClass }: { rows: Row[]; hunkId?: string; diffId?: string; path: string; oldHref?: (line: number) => string; afterRow?: (row: Row, index: number) => ReactNode; onRowClick?: (row: Row) => void; rowClass?: (row: Row) => string | undefined }) {
  const commits = useContext(StackContext);
  const cells = useRef<(HTMLTableCellElement | null)[]>([]);
  const painter = useRef<RowPainter>(null);
  useLayoutEffect(() => {
    painter.current = new RowPainter();
    return () => painter.current?.dispose();
  }, []);
  useLayoutEffect(() => painter.current?.update(cells.current, rowSegments(path, rows)), [path, rows]);
  return <>{rows.map((row, i) => {
    const inHunk = hunkId !== undefined && row.hunkId !== undefined;
    const target = hunkId !== undefined && row.hunkId === hunkId;
    const jumps = onRowClick !== undefined && row.hunkId !== undefined;
    const classes = [row.kind, inHunk && "in-hunk", target && "target", jumps && "jumps", rowClass?.(row)].filter(Boolean).join(" ");
    const commit = row.commit === undefined ? undefined : commits?.[row.commit];
    const rowColor = commit ? commitColors(row.commit!).row : undefined;
    return <Fragment key={`${row.hunkId ?? "context"}-${i}`}><tr className={classes} data-hunk={row.hunkId} data-anchor={diffId && `${diffId}#${row.hunkId ?? hunkId}`} data-path={path} data-old={row.old} data-new={row.new} data-commit={commit ? row.commit : undefined} onClick={jumps ? () => { if (window.getSelection()?.isCollapsed !== false) onRowClick(row); } : undefined}>
      <td className="ln" style={rowColor ? { background: rowColor } : undefined}>{oldHref && row.old !== undefined ? <a href={oldHref(row.old)} target="_blank" rel="noreferrer">{row.old}</a> : row.old ?? ""}</td><td className="ln" style={rowColor ? { background: rowColor } : undefined}>{row.new ?? ""}</td><td className="sign" style={rowColor ? { background: rowColor } : undefined} title={commit ? commitLabel(row.commit!, commit) : undefined}>{SIGN[row.kind]}{commit && <span className="commit-tag">C{row.commit! + 1}</span>}</td><td className="code" ref={(cell) => { cells.current[i] = cell; }}>{row.text}</td>
    </tr>{afterRow?.(row, i)}</Fragment>;
  })}</>;
}

/** Row index where each change (a run of added and removed lines) of the file starts. */
export function changeStarts(rows: Row[]): number[] {
  return rows.flatMap((row, i) => row.kind !== "ctx" && (i === 0 || rows[i - 1]!.kind === "ctx" || rows[i - 1]!.hunkId !== row.hunkId) ? [i] : []);
}

/** `onJump` reveals a hunk row on the canvas. Previous / Next change (or p / n in the panel) step through the file's changes. */
export function FilePanel({ sessionId, diff, open, onClose, onJump }: {
  sessionId: string;
  diff: Artifact<DiffData>;
  open: OpenFile;
  onClose: () => void;
  onJump: (row: HunkRow) => void;
}) {
  const file = diff.data.files.find((item) => item.path === open.path);
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => {
    if (!file) return [];
    return lines ? fileRows(file, lines) : file.hunks.flatMap((hunk) => numberLines(hunk).map((row) => ({ ...row, hunkId: hunk.id })));
  }, [file, lines]);
  const starts = useMemo(() => changeStarts(rows), [rows]);
  const [change, setChange] = useState<number | null>(null);
  useEffect(() => setChange(null), [open]);
  const current = change ?? Math.max(0, starts.findIndex((i) => rows[i]!.hunkId === open.hunkId));
  const step = (delta: number) => {
    const next = current + delta;
    if (next < 0 || next >= starts.length || !body.current) return;
    setChange(next);
    const all = [...body.current.querySelectorAll<HTMLElement>("tr[data-path]")];
    for (const row of body.current.querySelectorAll("tr.focus")) row.classList.remove("focus");
    const start = starts[next]!;
    let end = start + 1;
    while (end < rows.length && rows[end]!.kind !== "ctx" && rows[end]!.hunkId === rows[start]!.hunkId) end++;
    const block = all.slice(start, end);
    for (const row of block) row.classList.add("focus");
    block[0]?.scrollIntoView({ block: "center" });
    // Keeps p / n working when the button that was pressed becomes disabled at either end.
    body.current.focus({ preventScroll: true });
  };

  useEffect(() => {
    let active = true;
    setLines(null);
    setError(null);
    if (file && (file.status === "modified" || file.status === "renamed")) {
      void loadFileLines(sessionId, diff.id, file.path).then((loaded) => {
        if (active) setLines(loaded);
      }).catch((e: unknown) => {
        if (active) setError((e as Error).message);
      });
    }
    return () => { active = false; };
  }, [sessionId, diff.id, file]);

  useEffect(() => {
    if (!body.current) return;
    const rows = [...body.current.querySelectorAll<HTMLElement>("[data-hunk]")];
    body.current.querySelector("tr.focus")?.classList.remove("focus");
    const focus = open.text === undefined ? undefined : rows.find((row) => row.dataset.hunk === open.hunkId && row.querySelector("td.code")?.textContent === open.text);
    focus?.classList.add("focus");
    const target = focus ?? rows.find((row) => row.dataset.hunk === open.hunkId);
    target?.scrollIntoView({ block: "center" });
  }, [rows, open.hunkId, open.text]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || (event.key !== "n" && event.key !== "p")) return;
    event.preventDefault();
    step(event.key === "n" ? 1 : -1);
  };
  return <aside className="file-panel" data-testid="file-panel" onKeyDown={onKeyDown}>
    <header><span>{open.path}</span><span className="change-nav">{starts.length > 0 && <><button aria-label="Previous change" title="Previous change (p)" disabled={current === 0} onClick={() => step(-1)}>↑</button><span data-testid="change-position">{current + 1}/{starts.length}</span><button aria-label="Next change" title="Next change (n)" disabled={current === starts.length - 1} onClick={() => step(1)}>↓</button></>}</span><button aria-label="Close file" onClick={onClose}>×</button></header>
    <div className="file-panel-body" ref={body} tabIndex={-1}>
      {file && <div className="diff"><table><tbody><DiffRows rows={rows} hunkId={open.hunkId} diffId={diff.id} path={file.path} onRowClick={(row) => onJump(row.new !== undefined ? { hunkId: row.hunkId!, side: "new", line: row.new } : { hunkId: row.hunkId!, side: "old", line: row.old! })} /></tbody></table></div>}
      {error && <p className="file-panel-error">{error}</p>}
    </div>
  </aside>;
}
