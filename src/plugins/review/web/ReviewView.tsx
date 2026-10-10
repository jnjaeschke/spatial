import { useState } from "react";
import { type Artifact, type DiffData, Canvas, FileViewContext, FilePanel, StackContext, TopbarExtras, type PhaseViewProps, type HunkRow } from "../../../web/plugin-api.ts";
import { latestNarrative } from "./graph.ts";
import { JumpContext, reviewCanvas } from "./canvas.tsx";
import { diffNumber, interdiffOf, latestDiff } from "../shared/diffs.ts";
import { AnalysisStatus } from "./AnalysisStatus.tsx";
import { RevisionView } from "./RevisionView.tsx";
import { InterdiffPanel } from "./InterdiffPanel.tsx";
import { SpecPanel, SpecStepContext, type SpecStepSelection } from "./SpecPanel.tsx";
import type { LineRange } from "../shared/types.ts";
import { backDetail, closeDetails, DetailsContext, openDetail, type DetailsState } from "./details.ts";

export function ReviewView({ state, models, drafts, readOnly = false, onSent, onDiscard, onOpenAside }: PhaseViewProps) {
  const [details, setDetails] = useState<DetailsState>(closeDetails);
  const [jump, setJump] = useState<HunkRow | null>(null);
  const [specSelection, setSpecSelection] = useState<SpecStepSelection | null>(null);
  const narrative = latestNarrative(state);
  const diff = latestDiff(state.artifacts);
  const stack = diff && diff.data.commits.length > 1 ? diff.data.commits : null;
  const epoch = diff ? diffNumber(state.artifacts, diff.id) : null;
  const interdiff = diff ? interdiffOf(state.artifacts, state.links, diff.id) : null;
  const body = narrative ? <JumpContext.Provider value={jump}><Canvas model={reviewCanvas} state={state} models={readOnly ? null : models} drafts={drafts} onSent={onSent} onOpenAside={onOpenAside} onDiscard={onDiscard} /></JumpContext.Provider>
    : diff && epoch !== null ? <RevisionView sessionId={state.session.id} diff={diff as Artifact<DiffData>} epoch={epoch} state={state} models={models} />
      : <AnalysisStatus state={state} models={models} />;
  const focusSpecRange = (range: LineRange) => {
    if (!diff) return;
    const file = diff.data.files.find((item) => item.path === range.path);
    const hunk = file?.hunks.find((item) => {
      const start = range.side === "new" ? item.newStart : item.oldStart;
      const count = range.side === "new" ? item.newLines : item.oldLines;
      return start <= range.start && range.start <= start + count - 1;
    });
    if (hunk) setJump({ hunkId: hunk.id, side: range.side, line: range.start });
  };
  return <SpecStepContext.Provider value={details.current?.kind === "spec" ? specSelection : null}>
    <TopbarExtras>{epoch !== null && <span className="epoch" data-testid="epoch">Epoch {epoch}</span>}{diff && <span className="range" title={`${diff.data.baseSha}..${diff.data.headSha}`} data-testid="review-range">Reviewing {diff.data.commits.length} commit{diff.data.commits.length === 1 ? "" : "s"}: {diff.data.baseSha.slice(0, 12)}..{diff.data.headSha.slice(0, 12)}</span>}{interdiff && epoch !== null && <button onClick={() => setDetails((current) => current.current?.kind === "interdiff" ? closeDetails() : openDetail(current, { kind: "interdiff" }))}>Interdiff</button>}</TopbarExtras>
    {readOnly ? <StackContext.Provider value={stack}><div className="session-body">{body}</div></StackContext.Provider> : <DetailsContext.Provider value={{ current: details.current, open: (detail) => { setSpecSelection(null); setDetails((current) => openDetail(current, detail)); } }}><FileViewContext.Provider value={(file) => { if (file.row && narrative) setJump({ hunkId: file.hunkId, ...file.row }); else { setSpecSelection(null); setDetails((current) => openDetail(current, { kind: "file", file })); } }}>
      <StackContext.Provider value={stack}><div className="session-body">
        {body}
        {details.current?.kind === "spec" && narrative && <SpecPanel state={state} specId={details.current.specId} llm={models.default} onClose={() => { setSpecSelection(null); setDetails(closeDetails()); }} onBack={details.back.length ? () => setDetails(backDetail) : undefined} onFocusRange={focusSpecRange} onSelection={setSpecSelection} />}
        {details.current?.kind === "interdiff" && interdiff && epoch !== null ? <InterdiffPanel interdiff={interdiff} epoch={epoch} onClose={() => { setSpecSelection(null); setDetails(closeDetails()); }} onBack={details.back.length ? () => setDetails(backDetail) : undefined} /> : details.current?.kind === "file" && diff && details.current.file.diffId === diff.id && <FilePanel sessionId={state.session.id} diff={diff} open={details.current.file} onClose={() => { setSpecSelection(null); setDetails(closeDetails()); }} onBack={details.back.length ? () => setDetails(backDetail) : undefined} onJump={setJump} />}
      </div></StackContext.Provider>
    </FileViewContext.Provider></DetailsContext.Provider>}
  </SpecStepContext.Provider>;
}
