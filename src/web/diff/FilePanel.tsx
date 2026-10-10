import { useEffect, useMemo, useRef, useState } from "react";
import type { Artifact, DiffData } from "../../shared/types.ts";
import { loadFileLines } from "../file-lines.ts";
import { FileViewContext, type FileViewRequest } from "../file-view-context.ts";
import { SidePanel } from "../SidePanel.tsx";
import { fileRows, numberLines } from "../../shared/diff-lines.ts";
import { DiffRows, changeStarts } from "./DiffRows.tsx";

/** A diff location to reveal in the canvas. */
export interface HunkRow { hunkId: string; side: "new" | "old"; line: number }

/** `onJump` reveals a hunk row on the canvas. Previous / Next change (or p / n in the panel) step through the file's changes. */
export function FilePanel({ sessionId, diff, open, onClose, onJump, onBack }: {
  sessionId: string;
  diff: Artifact<DiffData>;
  open: FileViewRequest;
  onClose: () => void;
  onJump: (row: HunkRow) => void;
  onBack?: () => void;
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
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || (event.key !== "n" && event.key !== "p")) return;
    event.preventDefault();
    step(event.key === "n" ? 1 : -1);
  };
  return <SidePanel className="file-panel" title={open.path} closeLabel="Close file" onClose={onClose} testId="file-panel" onKeyDown={onKeyDown} bodyRef={body} headerExtra={<>{onBack && <button aria-label="Back" onClick={onBack}>←</button>}<span className="change-nav">{starts.length > 0 && <><button aria-label="Previous change" title="Previous change (p)" disabled={current === 0} onClick={() => step(-1)}>↑</button><span data-testid="change-position">{current + 1}/{starts.length}</span><button aria-label="Next change" title="Next change (n)" disabled={current === starts.length - 1} onClick={() => step(1)}>↓</button></>}</span></>}>
      {file && <div className="diff"><table><tbody><DiffRows rows={rows} hunkId={open.hunkId} diffId={diff.id} path={file.path} onRowClick={(row) => onJump(row.new !== undefined ? { hunkId: row.hunkId!, side: "new", line: row.new } : { hunkId: row.hunkId!, side: "old", line: row.old! })} /></tbody></table></div>}
      {error && <p className="file-panel-error">{error}</p>}
  </SidePanel>;
}
