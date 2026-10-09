import { Fragment, useContext, useLayoutEffect, useRef, type ReactNode } from "react";
import { RowPainter, rowSegments } from "../syntax.ts";
import { StackContext } from "./stack-context.ts";
import { commitColors, commitLabel } from "./commit-colors.ts";
import type { Row } from "../../shared/diff-lines.ts";

/** Renders numbered diff rows and optional content inserted after each row. */
export function DiffRows({ rows, hunkId, diffId, path, oldHref, afterRow, onRowClick, rowClass }: { rows: Row[]; hunkId?: string; diffId?: string; path: string; oldHref?: (line: number) => string; afterRow?: (row: Row, index: number) => ReactNode; onRowClick?: (row: Row) => void; rowClass?: (row: Row) => string | undefined }) {
  const commits = useContext(StackContext);
  const cells = useRef<(HTMLTableCellElement | null)[]>([]);
  const painter = useRef<RowPainter>(null);
  useLayoutEffect(() => { painter.current = new RowPainter(); return () => painter.current?.dispose(); }, []);
  useLayoutEffect(() => painter.current?.update(cells.current, rowSegments(path, rows)), [path, rows]);
  return <>{rows.map((row, i) => {
    const inHunk = hunkId !== undefined && row.hunkId !== undefined;
    const target = hunkId !== undefined && row.hunkId === hunkId;
    const jumps = onRowClick !== undefined && row.hunkId !== undefined;
    const classes = [row.kind, inHunk && "in-hunk", target && "target", jumps && "jumps", rowClass?.(row)].filter(Boolean).join(" ");
    const commit = row.commit === undefined ? undefined : commits?.[row.commit];
    const rowColor = commit ? commitColors(row.commit!).row : undefined;
    return <Fragment key={`${row.hunkId ?? "context"}-${i}`}><tr className={classes} data-hunk={row.hunkId} data-anchor={diffId && `${diffId}#${row.hunkId ?? hunkId}`} data-path={path} data-old={row.old} data-new={row.new} data-commit={commit ? row.commit : undefined} onClick={jumps ? () => { if (window.getSelection()?.isCollapsed !== false) onRowClick(row); } : undefined}>
      <td className="ln" style={rowColor ? { background: rowColor } : undefined}>{oldHref && row.old !== undefined ? <a href={oldHref(row.old)} target="_blank" rel="noreferrer">{row.old}</a> : row.old ?? ""}</td><td className="ln" style={rowColor ? { background: rowColor } : undefined}>{row.new ?? ""}</td><td className="sign" style={rowColor ? { background: rowColor } : undefined} title={commit ? commitLabel(row.commit!, commit) : undefined}>{({ ctx: " ", add: "+", del: "-" } as const)[row.kind]}{commit && <span className="commit-tag">C{row.commit! + 1}</span>}</td><td className="code" ref={(cell) => { cells.current[i] = cell; }}>{row.text}</td>
    </tr>{afterRow?.(row, i)}</Fragment>;
  })}</>;
}

/** Row index where each change (a run of added and removed lines) of the file starts. */
export function changeStarts(rows: Row[]): number[] {
  return rows.flatMap((row, i) => row.kind !== "ctx" && (i === 0 || rows[i - 1]!.kind === "ctx" || rows[i - 1]!.hunkId !== row.hunkId) ? [i] : []);
}
