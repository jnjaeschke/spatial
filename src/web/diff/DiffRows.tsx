import { Fragment, useContext, useLayoutEffect, useRef, type ReactNode } from "react";
import { RowPainter, rowSegments } from "../syntax.ts";
import { StackContext } from "./stack-context.ts";
import { commitColors, commitLabel } from "./commit-colors.ts";
import type { Row } from "../../shared/diff-lines.ts";

/** A span of a row's code painted with the `highlight` registry name; `title` shows on hover. */
export interface RowMark { start: number; end: number; name: string; highlight: string; title: string }

function markAtPoint(cell: HTMLTableCellElement, x: number, y: number, marks: RowMark[]): RowMark | undefined {
  const caret = document.caretPositionFromPoint?.(x, y);
  const range = caret ? undefined : document.caretRangeFromPoint?.(x, y);
  const node = caret?.offsetNode ?? range?.startContainer;
  const offset = caret?.offset ?? range?.startOffset;
  if (node !== cell.firstChild || node?.nodeType !== Node.TEXT_NODE || offset === undefined) return;
  return marks.find((mark) => offset >= mark.start && offset < mark.end);
}

function markRect(cell: HTMLTableCellElement, mark: RowMark): DOMRect {
  const range = document.createRange();
  range.setStart(cell.firstChild!, mark.start);
  range.setEnd(cell.firstChild!, mark.end);
  return range.getBoundingClientRect();
}

/** Renders numbered diff rows and optional content inserted after each row. */
const oldLine = (href: string | null, line: number): ReactNode => href ? <a href={href} target="_blank" rel="noreferrer">{line}</a> : line;

export function DiffRows({ rows, hunkId, diffId, path, oldHref, afterRow, onRowClick, rowClass, marks, onMark, onMarkHover }: { rows: Row[]; hunkId?: string; diffId?: string; path: string; oldHref?: (line: number) => string | null; afterRow?: (row: Row, index: number) => ReactNode; onRowClick?: (row: Row) => void; rowClass?: (row: Row) => string | undefined; marks?: (row: Row) => RowMark[]; onMark?: (mark: { name: string }, rect: DOMRect) => void; onMarkHover?: (mark: { name: string } | null, rect: DOMRect | null) => void }) {
  const commits = useContext(StackContext);
  const cells = useRef<(HTMLTableCellElement | null)[]>([]);
  const painter = useRef<RowPainter>(null);
  const markPainter = useRef<RowPainter>(null);
  useLayoutEffect(() => { painter.current = new RowPainter(); return () => painter.current?.dispose(); }, []);
  useLayoutEffect(() => { markPainter.current = new RowPainter(); return () => markPainter.current?.dispose(); }, []);
  useLayoutEffect(() => painter.current?.update(cells.current, rowSegments(path, rows)), [path, rows]);
  useLayoutEffect(() => markPainter.current?.update(cells.current, rows.flatMap((row, index) => (marks?.(row) ?? []).map((mark) => ({ row: index, start: mark.start, end: mark.end, name: mark.highlight })))), [rows, marks]);
  return <>{rows.map((row, i) => {
    const inHunk = hunkId !== undefined && row.hunkId !== undefined;
    const target = hunkId !== undefined && row.hunkId === hunkId;
    const jumps = onRowClick !== undefined && row.hunkId !== undefined;
    const classes = [row.kind, inHunk && "in-hunk", target && "target", jumps && "jumps", rowClass?.(row)].filter(Boolean).join(" ");
    const commit = row.commit === undefined ? undefined : commits?.[row.commit];
    const rowColor = commit ? commitColors(row.commit!).row : undefined;
    return <Fragment key={`${row.hunkId ?? "context"}-${i}`}><tr className={classes} data-hunk={row.hunkId} data-anchor={diffId && `${diffId}#${row.hunkId ?? hunkId}`} data-path={path} data-old={row.old} data-new={row.new} data-commit={commit ? row.commit : undefined} onClick={jumps ? () => { if (window.getSelection()?.isCollapsed !== false) onRowClick(row); } : undefined}>
      <td className="ln" style={rowColor ? { background: rowColor } : undefined}>{oldHref && row.old !== undefined ? oldLine(oldHref(row.old), row.old) : row.old ?? ""}</td><td className="ln" style={rowColor ? { background: rowColor } : undefined}>{row.new ?? ""}</td><td className="sign" style={rowColor ? { background: rowColor } : undefined} title={commit ? commitLabel(row.commit!, commit) : undefined}>{({ ctx: " ", add: "+", del: "-" } as const)[row.kind]}{commit && <span className="commit-tag">C{row.commit! + 1}</span>}</td><td className="code" ref={(cell) => { cells.current[i] = cell; }} onMouseMove={marks ? (event) => { const mark = markAtPoint(event.currentTarget, event.clientX, event.clientY, marks(row)); event.currentTarget.title = mark?.title ?? ""; event.currentTarget.style.cursor = mark ? "pointer" : ""; onMarkHover?.(mark ? { name: mark.name } : null, mark ? markRect(event.currentTarget, mark) : null); } : undefined} onMouseLeave={(event) => { event.currentTarget.style.cursor = ""; onMarkHover?.(null, null); }} onClick={onMark ? (event) => { const mark = markAtPoint(event.currentTarget, event.clientX, event.clientY, marks?.(row) ?? []); if (mark) { event.stopPropagation(); onMark({ name: mark.name }, markRect(event.currentTarget, mark)); } } : undefined}>{row.text}</td>
    </tr>{afterRow?.(row, i)}</Fragment>;
  })}</>;
}

/** Row index where each change (a run of added and removed lines) of the file starts. */
export function changeStarts(rows: Row[]): number[] {
  return rows.flatMap((row, i) => row.kind !== "ctx" && (i === 0 || rows[i - 1]!.kind === "ctx" || rows[i - 1]!.hunkId !== row.hunkId) ? [i] : []);
}
