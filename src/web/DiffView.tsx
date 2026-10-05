import { useContext, useState } from "react";
import type { DiffFile, Hunk } from "../shared/types.ts";
import { fileRows, numberLines, type Row } from "./diff-lines.ts";
import { loadFileLines } from "./file-lines.ts";
import { DiffRows, FileViewContext } from "./FilePanel.tsx";

const STEP = 20;

/** Read-only hunk. `nodrag nopan` lets users select text instead of moving the canvas. */
export function DiffView({ sessionId, diffId, file, hunk }: { sessionId: string; diffId: string; file: DiffFile; hunk: Hunk }) {
  const [above, setAbove] = useState(0);
  const [below, setBelow] = useState(0);
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openFile = useContext(FileViewContext);
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
  const canShowAbove = canExpand && (expanded ? start > 0 : hunk.newStart > 1);
  const canShowBelow = canExpand && (expanded ? start + rows.length < fileRows(file, lines).length : true);
  return (
    <div className="diff nodrag nopan" data-testid={`hunk-${hunk.id}`}>
      <div className="diff-head">{openFile ? <button className="file-link" onClick={() => openFile({ diffId, path: file.path, hunkId: hunk.id })}>{file.path}</button> : file.path} <span className="hunk-header">{hunk.header}</span></div>
      <table><tbody>
        {canShowAbove && <tr className="expand"><td colSpan={4}><button onClick={() => void expand("above")}>↑ 20 lines</button></td></tr>}
        <DiffRows rows={rows} />
        {canShowBelow && <tr className="expand"><td colSpan={4}><button onClick={() => void expand("below")}>↓ 20 lines</button></td></tr>}
        {error && <tr className="diff-error"><td colSpan={4}>{error}</td></tr>}
      </tbody></table>
    </div>
  );
}
