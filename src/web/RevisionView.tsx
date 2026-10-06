import type { Artifact, DiffData } from "../shared/types.ts";
import { DiffView } from "./DiffView.tsx";
import { AskContext } from "./chat-context.ts";
import type { ModelsResponse, SessionState } from "../shared/types.ts";
import { AnalysisStatus } from "./AnalysisStatus.tsx";

export function RevisionView({ sessionId, diff, epoch, state, models }: { sessionId: string; diff: Artifact<DiffData>; epoch: number; state: SessionState; models: ModelsResponse }) {
  return <div className="revision-view">
    <p className="empty">Epoch {epoch} is being prepared for review.</p><AnalysisStatus state={state} models={models} />
    <div className="revision-files">
      <AskContext.Provider value={null}>
        {diff.data.files.map((file) => file.hunks.map((hunk) => <DiffView key={`${file.path}-${hunk.id}`} sessionId={sessionId} diffId={diff.id} file={file} hunk={hunk} />))}
      </AskContext.Provider>
    </div>
  </div>;
}
