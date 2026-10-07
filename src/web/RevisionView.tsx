import { useState } from "react";
import type { Artifact, DiffData, DiffFile } from "../shared/types.ts";
import { DiffView } from "./DiffView.tsx";
import { AskContext } from "./chat-context.ts";
import type { ModelsResponse, SessionState } from "../shared/types.ts";
import { AnalysisStatus } from "./AnalysisStatus.tsx";

/** Diff lines up to which every file starts open; larger diffs (a wrong range can hold thousands of files) mount a file's hunks only when it is opened. */
const OPEN_LINES = 2000;

function RevisionFile({ sessionId, diffId, file, open: initiallyOpen }: { sessionId: string; diffId: string; file: DiffFile; open: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return <details className="revision-file" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><code>{file.path}</code> <span className="counts">{file.hunks.length} hunk{file.hunks.length === 1 ? "" : "s"}</span></summary>
    {open && file.hunks.map((hunk) => <DiffView key={hunk.id} sessionId={sessionId} diffId={diffId} file={file} hunk={hunk} />)}
  </details>;
}

export function RevisionView({ sessionId, diff, epoch, state, models }: { sessionId: string; diff: Artifact<DiffData>; epoch: number; state: SessionState; models: ModelsResponse }) {
  const small = diff.data.files.reduce((sum, file) => sum + file.hunks.reduce((lines, hunk) => lines + hunk.lines.length, 0), 0) <= OPEN_LINES;
  return <div className="revision-view">
    <p className="empty">Epoch {epoch} is being prepared for review.</p><AnalysisStatus state={state} models={models} />
    <div className="revision-files">
      <AskContext.Provider value={null}>
        {diff.data.files.map((file) => <RevisionFile key={file.path} sessionId={sessionId} diffId={diff.id} file={file} open={small} />)}
      </AskContext.Provider>
    </div>
  </div>;
}
