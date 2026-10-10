import { useState } from "react";
import { type Artifact, type DiffData, Canvas, FileViewContext, FilePanel, StackContext, TopbarExtras, type PhaseViewProps, type HunkRow } from "../../../web/plugin-api.ts";
import { latestNarrative } from "./graph.ts";
import { JumpContext, reviewCanvas } from "./canvas.tsx";
import { diffNumber, interdiffOf, latestDiff } from "../shared/diffs.ts";
import { AnalysisStatus } from "./AnalysisStatus.tsx";
import { RevisionView } from "./RevisionView.tsx";
import { InterdiffPanel } from "./InterdiffPanel.tsx";
import { SpecView, SpecViewContext } from "./SpecView.tsx";
import { backDetail, closeDetails, DetailsContext, openDetail, type DetailsState } from "./details.ts";

export function ReviewView({ state, models, drafts, readOnly = false, onSent, onDiscard, onOpenAside }: PhaseViewProps) {
  const [details, setDetails] = useState<DetailsState>(closeDetails);
  const [jump, setJump] = useState<HunkRow | null>(null);
  const narrative = latestNarrative(state);
  const diff = latestDiff(state.artifacts);
  const stack = diff && diff.data.commits.length > 1 ? diff.data.commits : null;
  const epoch = diff ? diffNumber(state.artifacts, diff.id) : null;
  const interdiff = diff ? interdiffOf(state.artifacts, state.links, diff.id) : null;
  const body = narrative ? <JumpContext.Provider value={jump}><Canvas model={reviewCanvas} state={state} models={readOnly ? null : models} drafts={drafts} onSent={onSent} onOpenAside={onOpenAside} onDiscard={onDiscard} /></JumpContext.Provider>
    : diff && epoch !== null ? <RevisionView sessionId={state.session.id} diff={diff as Artifact<DiffData>} epoch={epoch} state={state} models={models} />
      : <AnalysisStatus state={state} models={models} />;
  return <>
    <TopbarExtras>{epoch !== null && <span className="epoch" data-testid="epoch">Epoch {epoch}</span>}{diff && <span className="range" title={`${diff.data.baseSha}..${diff.data.headSha}`} data-testid="review-range">Reviewing {diff.data.commits.length} commit{diff.data.commits.length === 1 ? "" : "s"}: {diff.data.baseSha.slice(0, 12)}..{diff.data.headSha.slice(0, 12)}</span>}{interdiff && epoch !== null && <button onClick={() => setDetails((current) => current.current?.kind === "interdiff" ? closeDetails() : openDetail(current, { kind: "interdiff" }))}>Interdiff</button>}</TopbarExtras>
    {readOnly ? <StackContext.Provider value={stack}><SpecViewContext.Provider value={() => {}}><div className="session-body">{body}</div></SpecViewContext.Provider></StackContext.Provider> : <DetailsContext.Provider value={{ current: details.current, open: (detail) => setDetails((current) => openDetail(current, detail)) }}><FileViewContext.Provider value={(file) => { if (file.row && narrative) setJump({ hunkId: file.hunkId, ...file.row }); else setDetails((current) => openDetail(current, { kind: "file", file })); }}>
      <StackContext.Provider value={stack}><SpecViewContext.Provider value={(specId) => setDetails((current) => openDetail(current, { kind: "spec", specId }))}><div className="session-body">
        {body}
        {details.current?.kind === "spec" && narrative && <SpecView state={state} specId={details.current.specId} llm={models.default} onClose={() => setDetails(closeDetails())} />}
        {details.current?.kind === "interdiff" && interdiff && epoch !== null ? <InterdiffPanel interdiff={interdiff} epoch={epoch} onClose={() => setDetails(closeDetails())} onBack={details.back.length ? () => setDetails(backDetail) : undefined} /> : details.current?.kind === "file" && diff && details.current.file.diffId === diff.id && <FilePanel sessionId={state.session.id} diff={diff} open={details.current.file} onClose={() => setDetails(closeDetails())} onBack={details.back.length ? () => setDetails(backDetail) : undefined} onJump={setJump} />}
      </div></SpecViewContext.Provider></StackContext.Provider>
    </FileViewContext.Provider></DetailsContext.Provider>}
  </>;
}
