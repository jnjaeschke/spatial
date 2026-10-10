import type { InterdiffData } from "../shared/types.ts";
import type { Artifact } from "../../../web/plugin-api.ts";
import { numberLines, DiffRows, SidePanel } from "../../../web/plugin-api.ts";

export function InterdiffPanel({ interdiff, epoch, onClose, onBack }: { interdiff: Artifact<InterdiffData>; epoch: number; onClose(): void; onBack?: () => void }) {
  return <SidePanel className="interdiff-panel" title={`Changes since epoch ${epoch - 1}`} closeLabel="Close interdiff" onClose={onClose} testId="interdiff-panel" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }} headerExtra={onBack && <button aria-label="Back" onClick={onBack}>←</button>}>
      {interdiff.data.conflicts.length > 0 && <p className="interdiff-conflicts">The old patch did not replay cleanly onto the new base. Compared per file: {interdiff.data.conflicts.join(", ")}</p>}
      {interdiff.data.files.length === 0 && <p className="empty">No code changes</p>}
      {interdiff.data.files.map((file) => <section key={file.path}>
        <h3>{file.path}</h3>
        {file.hunks.map((hunk) => {
          const rows = numberLines(hunk).map((row) => ({ ...row, hunkId: hunk.id }));
          return <div className="diff" key={hunk.id}><table><tbody><DiffRows rows={rows} hunkId={hunk.id} path={file.path} /></tbody></table></div>;
        })}
      </section>)}
  </SidePanel>;
}
