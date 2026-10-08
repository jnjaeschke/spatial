import type { InterdiffData } from "../shared/types.ts";
import type { Artifact } from "../../../web/plugin-api.ts";
import { numberLines } from "../shared/diff-lines.ts";
import { DiffRows } from "./FilePanel.tsx";

export function InterdiffPanel({ interdiff, epoch, onClose }: { interdiff: Artifact<InterdiffData>; epoch: number; onClose(): void }) {
  return <aside className="file-panel" data-testid="interdiff-panel">
    <header><span>Changes since epoch {epoch - 1}</span><button aria-label="Close interdiff" onClick={onClose}>×</button></header>
    <div className="file-panel-body">
      {interdiff.data.conflicts.length > 0 && <p className="interdiff-conflicts">The old patch did not replay cleanly onto the new base. Compared per file: {interdiff.data.conflicts.join(", ")}</p>}
      {interdiff.data.files.length === 0 && <p className="empty">No code changes</p>}
      {interdiff.data.files.map((file) => <section key={file.path}>
        <h3>{file.path}</h3>
        {file.hunks.map((hunk) => {
          const rows = numberLines(hunk).map((row) => ({ ...row, hunkId: hunk.id }));
          return <div className="diff" key={hunk.id}><table><tbody><DiffRows rows={rows} hunkId={hunk.id} path={file.path} /></tbody></table></div>;
        })}
      </section>)}
    </div>
  </aside>;
}
