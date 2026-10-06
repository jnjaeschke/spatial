import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Artifact, DiffData } from "../shared/types.ts";
import { fileRows, numberLines, type Row } from "../shared/diff-lines.ts";
import { loadFileLines } from "./file-lines.ts";
import { StackContext } from "./stack-context.ts";
import { commitColors, commitLabel } from "./commit-colors.ts";

export interface OpenFile {
  diffId: string;
  path: string;
  hunkId: string;
  text?: string;
}

export const FileViewContext = createContext<((file: OpenFile) => void) | null>(null);

const SIGN = { ctx: " ", add: "+", del: "-" } as const;

/** `oldHref` links old-side line numbers (e.g. to Searchfox). */
/** Rows without a `diffId` carry no `data-anchor`, so selecting them offers no Ask. */
export function DiffRows({ rows, hunkId, diffId, path, oldHref }: { rows: Row[]; hunkId?: string; diffId?: string; path: string; oldHref?: (line: number) => string }) {
  const commits = useContext(StackContext);
  return <>{rows.map((row, i) => {
    const inHunk = hunkId !== undefined && row.hunkId !== undefined;
    const target = hunkId !== undefined && row.hunkId === hunkId;
    const classes = [row.kind, inHunk && "in-hunk", target && "target"].filter(Boolean).join(" ");
    const commit = row.commit === undefined ? undefined : commits?.[row.commit];
    const rowColor = commit ? commitColors(row.commit!).row : undefined;
    return <tr key={`${row.hunkId ?? "context"}-${i}`} className={classes} data-hunk={row.hunkId} data-anchor={diffId && `${diffId}#${row.hunkId ?? hunkId}`} data-path={path} data-old={row.old} data-new={row.new} data-commit={commit ? row.commit : undefined}>
      <td className="ln" style={rowColor ? { background: rowColor } : undefined}>{oldHref && row.old !== undefined ? <a href={oldHref(row.old)} target="_blank" rel="noreferrer">{row.old}</a> : row.old ?? ""}</td><td className="ln" style={rowColor ? { background: rowColor } : undefined}>{row.new ?? ""}</td><td className="sign" style={rowColor ? { background: rowColor } : undefined} title={commit ? commitLabel(row.commit!, commit) : undefined}>{SIGN[row.kind]}{commit && <span className="commit-tag">C{row.commit! + 1}</span>}</td><td className="code">{row.text}</td>
    </tr>;
  })}</>;
}

export function FilePanel({ sessionId, diff, open, onClose }: {
  sessionId: string;
  diff: Artifact<DiffData>;
  open: OpenFile;
  onClose: () => void;
}) {
  const file = diff.data.files.find((item) => item.path === open.path);
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => {
    if (!file) return [];
    return lines ? fileRows(file, lines) : file.hunks.flatMap((hunk) => numberLines(hunk).map((row) => ({ ...row, hunkId: hunk.id })));
  }, [file, lines]);

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

  return <aside className="file-panel" data-testid="file-panel">
    <header><span>{open.path}</span><button aria-label="Close file" onClick={onClose}>×</button></header>
    <div className="file-panel-body" ref={body}>
      {file && <div className="diff"><table><tbody><DiffRows rows={rows} hunkId={open.hunkId} diffId={diff.id} path={file.path} /></tbody></table></div>}
      {error && <p className="file-panel-error">{error}</p>}
    </div>
  </aside>;
}
