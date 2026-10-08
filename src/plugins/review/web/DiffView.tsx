import { useContext, useState } from "react";
import type { DiffFile, Hunk } from "../../../web/plugin-api.ts";
import { fileRows, numberLines, type Row } from "../shared/diff-lines.ts";
import { loadFileLines } from "../../../web/plugin-api.ts";
import { DiffRows, FileViewContext } from "./FilePanel.tsx";
import { AskContext } from "../../../web/plugin-api.ts";
import { fileUrl, linkTitle, SearchfoxContext } from "../../../web/plugin-api.ts";
import type { HostedThread } from "../../../web/plugin-api.ts";
import type { ReactNode } from "react";

const STEP = 20;

/** Read-only hunk. `nodrag nopan` lets users select text instead of moving the canvas. */
export function DiffView({ sessionId, diffId, file, hunk, threads, renderThread }: { sessionId: string; diffId: string; file: DiffFile; hunk: Hunk; threads?: HostedThread[]; renderThread?: (thread: HostedThread) => ReactNode }) {
  const [above, setAbove] = useState(0);
  const [below, setBelow] = useState(0);
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openFile = useContext(FileViewContext);
  const ask = useContext(AskContext);
  const sf = useContext(SearchfoxContext);
  const path = file.oldPath ?? file.path;
  const linkable = sf && file.status !== "added";
  const canExpand = file.status === "modified" || file.status === "renamed";
  const expand = async (side: "above" | "below") => {
    try {
      const loaded = lines ?? await loadFileLines(sessionId, diffId, file.path);
      setLines(loaded);
      setError(null);
      (side === "above" ? setAbove : setBelow)((count) => count + STEP);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  let rows: Row[] = numberLines(hunk);
  let start = 0;
  let end = rows.length - 1;
  if (lines && above + below > 0) {
    const all = fileRows(file, lines);
    start = all.findIndex((row) => row.hunkId === hunk.id);
    end = all.findLastIndex((row) => row.hunkId === hunk.id);
    rows = all.slice(Math.max(0, start - above), Math.min(all.length, end + 1 + below));
    start = Math.max(0, start - above);
  }
  const expanded = lines !== null && above + below > 0;
  const insertAt = new Map<HostedThread, number>();
  for (const thread of threads ?? []) {
    const line = thread.lines;
    const targetHunk = thread.anchor.split("#").at(-1);
    const index = line && line.path === file.path && targetHunk === hunk.id
      ? rows.findIndex((row) => (!expanded || row.hunkId === hunk.id) && line.end === (line.side === "new" ? row.new : row.old)) : -1;
    if (index >= 0) insertAt.set(thread, index);
  }
  const afterRow = (_row: Row, index: number) => <>{[...insertAt].filter(([, target]) => target === index).map(([thread]) => <tr className="thread-row" key={thread.threadId ?? thread.draftId}><td colSpan={4}>{renderThread?.(thread)}</td></tr>)}</>;
  const canShowAbove = canExpand && (expanded ? start > 0 : hunk.newStart > 1);
  const canShowBelow = canExpand && (expanded ? start + rows.length < fileRows(file, lines).length : true);
  return (
    <div className="diff nodrag nopan" data-testid={`hunk-${hunk.id}`}>
      <div className="diff-head">{openFile ? <button className="file-link" onClick={() => openFile({ diffId, path: file.path, hunkId: hunk.id })}>{file.path}</button> : file.path}{linkable && <> <a className="sf-link" href={fileUrl(sf, path, hunk.oldStart)} title={linkTitle(sf)} target="_blank" rel="noreferrer">Searchfox</a></>} <span className="hunk-header">{hunk.header}</span>{ask && <button aria-label={`Ask about ${hunk.id}`} className="ask" onClick={() => ask.ask(`${diffId}#${hunk.id}`)}>Ask</button>}</div>
      {hunk.rewrites?.map(({ by, of, lines }) => <div className="rewrite-flag" data-testid="rewrite-flag" key={`${by}-${of}`}>C{by + 1} rewrites {lines} line{lines === 1 ? "" : "s"} added in C{of + 1}</div>)}
      <table><tbody>
        {canShowAbove && <tr className="expand"><td colSpan={4}><button onClick={() => void expand("above")}>↑ 20 lines</button></td></tr>}
        <DiffRows rows={rows} hunkId={hunk.id} diffId={diffId} path={file.path} oldHref={linkable ? (line) => fileUrl(sf, path, line) : undefined} afterRow={threads?.length ? afterRow : undefined} />
        {canShowBelow && <tr className="expand"><td colSpan={4}><button onClick={() => void expand("below")}>↓ 20 lines</button></td></tr>}
        {error && <tr className="diff-error"><td colSpan={4}>{error}</td></tr>}
      </tbody></table>
    </div>
  );
}
