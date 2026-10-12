import { useMemo, useState } from "react";
import type { DiffFile } from "../../shared/types.ts";
import { DiffRows } from "./DiffRows.tsx";
import { visibleRows, type Gap } from "./gaps.ts";

/** One file's diff without a session: its hunks in one table, unchanged stretches as gap rows that load the file once (`loadLines`, the new side) and open in place. */
export function FileDiff({ file, loadLines }: { file: DiffFile; loadLines?: () => Promise<string[]> }) {
  const [lines, setLines] = useState<string[] | null>(null);
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const { rows, gaps } = useMemo(() => visibleRows(file, lines, open), [file, lines, open]);
  const show = async (gap: Gap) => {
    try {
      if (!lines) setLines(await loadLines!());
      setOpen((current) => new Set([...current, gap.id]));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const gapRow = (gap: Gap) => <tr className="gap" key={`gap-${gap.id}`}><td colSpan={4}>{loadLines ? <button type="button" className="link-button" onClick={() => void show(gap)}>⋯ {gap.count === null ? "more unchanged lines" : `${gap.count} unchanged line${gap.count === 1 ? "" : "s"}`}</button> : "⋯"}</td></tr>;
  if (file.binary) return <p className="file-diff-binary">Binary file</p>;
  return <div className="diff file-diff" data-testid={`file-diff-${file.path}`}><table><tbody>
    {gaps.filter((gap) => gap.at === 0).map(gapRow)}
    <DiffRows rows={rows} path={file.path} afterRow={(_, index) => gaps.filter((gap) => gap.at === index + 1).map(gapRow)} />
    {error && <tr className="diff-error"><td colSpan={4}>{error}</td></tr>}
  </tbody></table></div>;
}
