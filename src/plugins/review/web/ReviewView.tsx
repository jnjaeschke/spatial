import { useCallback, useState } from "react";
import { type Artifact, type DiffData, Canvas, FileViewContext, FilePanel, StackContext, TopbarExtras, type PhaseViewProps, type FileViewRequest, type HunkRow } from "../../../web/plugin-api.ts";
import { latestNarrative } from "./graph.ts";
import { JumpContext, reviewCanvas } from "./canvas.tsx";
import { diffNumber, interdiffOf, latestDiff } from "../shared/diffs.ts";
import { AnalysisStatus } from "./AnalysisStatus.tsx";
import { RevisionView } from "./RevisionView.tsx";
import { InterdiffPanel } from "./InterdiffPanel.tsx";
import { SpecView, SpecViewContext } from "./SpecView.tsx";

export function ReviewView({ state, models, drafts, readOnly = false, onSent, onDiscard, onOpenAside }: PhaseViewProps) {
  const [openFile, setOpenFile] = useState<FileViewRequest | null>(null);
  const [aside, setAside] = useState<"file" | "interdiff" | null>(null);
  const [jump, setJump] = useState<HunkRow | null>(null);
  const [specView, setSpecView] = useState<string | null>(null);
  const closeSpecView = useCallback(() => setSpecView(null), []);
  const narrative = latestNarrative(state);
  const diff = latestDiff(state.artifacts);
  const stack = diff && diff.data.commits.length > 1 ? diff.data.commits : null;
  const epoch = diff ? diffNumber(state.artifacts, diff.id) : null;
  const interdiff = diff ? interdiffOf(state.artifacts, state.links, diff.id) : null;
  const body = narrative ? <JumpContext.Provider value={jump}><Canvas model={reviewCanvas} state={state} models={readOnly ? null : models} drafts={drafts} onSent={onSent} onOpenAside={onOpenAside} onDiscard={onDiscard} /></JumpContext.Provider>
    : diff && epoch !== null ? <RevisionView sessionId={state.session.id} diff={diff as Artifact<DiffData>} epoch={epoch} state={state} models={models} />
      : <AnalysisStatus state={state} models={models} />;
  return <>
    <TopbarExtras>{epoch !== null && <span className="epoch" data-testid="epoch">Epoch {epoch}</span>}{diff && <span className="range" title={`${diff.data.baseSha}..${diff.data.headSha}`} data-testid="review-range">Reviewing {diff.data.commits.length} commit{diff.data.commits.length === 1 ? "" : "s"}: {diff.data.baseSha.slice(0, 12)}..{diff.data.headSha.slice(0, 12)}</span>}{interdiff && epoch !== null && <button onClick={() => { setAside(aside === "interdiff" ? null : "interdiff"); setOpenFile(null); }}>Interdiff</button>}</TopbarExtras>
    {readOnly ? <StackContext.Provider value={stack}><SpecViewContext.Provider value={setSpecView}><div className="session-body">{body}</div></SpecViewContext.Provider></StackContext.Provider> : <FileViewContext.Provider value={(file) => { if (file.row && narrative) setJump({ hunkId: file.hunkId, ...file.row }); else { setOpenFile(file); setAside("file"); } }}>
      <StackContext.Provider value={stack}><SpecViewContext.Provider value={setSpecView}><div className="session-body">
        {body}
        {specView && narrative && <SpecView state={state} specId={specView} llm={models.default} onClose={closeSpecView} />}
        {aside === "interdiff" && interdiff && epoch !== null ? <InterdiffPanel interdiff={interdiff} epoch={epoch} onClose={() => setAside(null)} /> : aside === "file" && diff && openFile?.diffId === diff.id && <FilePanel sessionId={state.session.id} diff={diff} open={openFile} onClose={() => { setOpenFile(null); setAside(null); }} onJump={setJump} />}
      </div></SpecViewContext.Provider></StackContext.Provider>
    </FileViewContext.Provider>}
  </>;
}
