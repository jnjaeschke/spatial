import { useEffect, useMemo, useRef, useState } from "react";
import { type Artifact, type DiffData, Canvas, FileViewContext, FilePanel, StackContext, TopbarExtras, type PhaseViewProps, type HunkRow, useClosed } from "../../../web/plugin-api.ts";
import { latestNarrative, reviewGraph } from "./graph.ts";
import { JumpContext, RevealContext, reviewCanvas } from "./canvas.tsx";
import { diffNumber, interdiffOf, latestDiff } from "../shared/diffs.ts";
import { AnalysisStatus } from "./AnalysisStatus.tsx";
import { RevisionView } from "./RevisionView.tsx";
import { InterdiffPanel } from "./InterdiffPanel.tsx";
import { SpecPanel, SpecStepContext, type SpecStepSelection } from "./SpecPanel.tsx";
import type { LineRange } from "../shared/types.ts";
import { backDetail, canGoBack, closeDetails, DetailsContext, openDetail, type Detail, type DetailsState } from "./details.ts";
import { ChatDetails, useChatLookup } from "./ChatDetails.tsx";
import { CommentDetails, findComment } from "./CommentDetails.tsx";
import { FindingDetails, findFinding } from "./FindingDetails.tsx";
import { PhabDetails, findPhabThread } from "./PhabDetails.tsx";
import { SymbolDetails, findSymbol } from "./SymbolDetails.tsx";

export function ReviewView({ state, models, drafts, readOnly = false, onSent, onDiscard, onOpenAside }: PhaseViewProps) {
  const [details, setDetails] = useState<DetailsState>(closeDetails);
  const [jump, setJump] = useState<HunkRow | null>(null);
  const [specSelection, setSpecSelection] = useState<SpecStepSelection | null>(null);
  const closed = useClosed(state.session.id);
  const knownDrafts = useRef(new Set(drafts.map((draft) => draft.id)));
  const revealer = useRef<((nodeId: string, collapseId: string) => void) | null>(null);
  const narrative = latestNarrative(state);
  const graph = useMemo(() => reviewGraph(state, drafts), [state, drafts]);
  const diff = latestDiff(state.artifacts);
  const stack = diff && diff.data.commits.length > 1 ? diff.data.commits : null;
  const epoch = diff ? diffNumber(state.artifacts, diff.id) : null;
  const interdiff = diff ? interdiffOf(state.artifacts, state.links, diff.id) : null;
  const chatThread = useChatLookup(graph, drafts);
  useEffect(() => {
    for (const draft of drafts) {
      if (knownDrafts.current.has(draft.id)) continue;
      knownDrafts.current.add(draft.id);
      if (!draft.aside) setDetails((current) => openDetail(current, { kind: draft.kind === "comment" ? "comment" : "chat", id: draft.id }));
    }
  }, [drafts]);
  const resolves = (detail: Detail) => detail.kind === "chat" ? chatThread(detail.id) !== null : detail.kind === "comment" ? findComment(graph, detail.id) !== null : detail.kind === "finding" ? findFinding(graph, detail.id) !== null : detail.kind === "phab" ? findPhabThread(graph, detail.anchorId) !== null : detail.kind === "symbol" ? findSymbol(state, diff, detail.name) !== null : true;
  const back = canGoBack(details, resolves) ? () => setDetails((current) => backDetail(current, resolves)) : undefined;
  const closePanel = () => setDetails(closeDetails());
  const body = narrative ? <RevealContext.Provider value={revealer}><JumpContext.Provider value={jump}><Canvas model={reviewCanvas} closed={closed} state={state} models={readOnly ? null : models} drafts={drafts} onSent={onSent} onOpenAside={onOpenAside} onDiscard={onDiscard} /></JumpContext.Provider></RevealContext.Provider>
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
  const selectedChat = details.current?.kind === "chat" ? chatThread(details.current.id) : null;
  const selectedComment = details.current?.kind === "comment" ? findComment(graph, details.current.id) : null;
  const selectedFinding = details.current?.kind === "finding" ? findFinding(graph, details.current.id) : null;
  const selectedPhab = details.current?.kind === "phab" ? findPhabThread(graph, details.current.anchorId) : null;
  const selectedSymbol = details.current?.kind === "symbol" ? findSymbol(state, diff, details.current.name) : null;
  const chatActions = readOnly ? null : { models, sessionId: state.session.id, tasks: state.tasks, onSent, onDiscard, onNote: () => {} };
  const panels = <>
    {selectedChat && <ChatDetails thread={selectedChat} actions={chatActions} closed={closed} reveal={(nodeId, collapseId) => revealer.current?.(nodeId, collapseId)} onClose={closePanel} onBack={back} />}
    {selectedComment && <CommentDetails comment={selectedComment} actions={chatActions} onClose={closePanel} onBack={back} />}
    {selectedFinding && <FindingDetails data={selectedFinding} actions={chatActions} onClose={closePanel} onBack={back} />}
    {selectedPhab && <PhabDetails data={selectedPhab} actions={chatActions} reveal={(nodeId, collapseId) => revealer.current?.(nodeId, collapseId)} onClose={closePanel} onBack={back} />}
    {selectedSymbol && diff && <SymbolDetails sessionId={state.session.id} diffId={diff.id} symbol={selectedSymbol} stack={!!stack} onGo={() => setJump({ hunkId: selectedSymbol.hunk.id, side: "new", line: selectedSymbol.site.line })} onClose={closePanel} onBack={back} />}
    {details.current?.kind === "spec" && narrative && <SpecPanel state={state} specId={details.current.specId} llm={readOnly ? null : models.default} onClose={() => { setSpecSelection(null); setDetails(closeDetails()); }} onBack={back} onFocusRange={focusSpecRange} onSelection={setSpecSelection} />}
    {!readOnly && (details.current?.kind === "interdiff" && interdiff && epoch !== null ? <InterdiffPanel interdiff={interdiff} epoch={epoch} onClose={() => { setSpecSelection(null); setDetails(closeDetails()); }} onBack={back} /> : details.current?.kind === "file" && diff && details.current.file.diffId === diff.id && <FilePanel sessionId={state.session.id} diff={diff} open={details.current.file} onClose={() => { setSpecSelection(null); setDetails(closeDetails()); }} onBack={back} onJump={setJump} />)}
  </>;
  const session = <StackContext.Provider value={stack}><div className="session-body">{body}{panels}</div></StackContext.Provider>;
  return <SpecStepContext.Provider value={details.current?.kind === "spec" ? specSelection : null}>
    <TopbarExtras>{epoch !== null && <span className="epoch" data-testid="epoch">Epoch {epoch}</span>}{diff && <span className="range" title={`${diff.data.baseSha}..${diff.data.headSha}`} data-testid="review-range">Reviewing {diff.data.commits.length} commit{diff.data.commits.length === 1 ? "" : "s"}: {diff.data.baseSha.slice(0, 12)}..{diff.data.headSha.slice(0, 12)}</span>}{interdiff && epoch !== null && <button onClick={() => setDetails((current) => current.current?.kind === "interdiff" ? closeDetails() : openDetail(current, { kind: "interdiff" }))}>Interdiff</button>}</TopbarExtras>
    <DetailsContext.Provider value={{ current: details.current, open: (detail) => { setSpecSelection(null); setDetails((current) => openDetail(current, detail)); } }}>
      {readOnly ? session : <FileViewContext.Provider value={(file) => { if (file.row && narrative) setJump({ hunkId: file.hunkId, ...file.row }); else { setSpecSelection(null); setDetails((current) => openDetail(current, { kind: "file", file })); } }}>{session}</FileViewContext.Provider>}
    </DetailsContext.Provider>
  </SpecStepContext.Provider>;
}
