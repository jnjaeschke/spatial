import type { Artifact, DiffData } from "../shared/types.ts";
import { DiffView } from "./DiffView.tsx";
import { AskContext } from "./chat-context.ts";

export function RevisionView({ sessionId, diff, epoch }: { sessionId: string; diff: Artifact<DiffData>; epoch: number }) {
  return <div className="revision-view">
    <p className="empty">Epoch {epoch} has no narrative yet. Press Narrate to review it.</p>
    <div className="revision-files">
      <AskContext.Provider value={null}>
        {diff.data.files.map((file) => file.hunks.map((hunk) => <DiffView key={`${file.path}-${hunk.id}`} sessionId={sessionId} diffId={diff.id} file={file} hunk={hunk} />))}
      </AskContext.Provider>
    </div>
  </div>;
}
