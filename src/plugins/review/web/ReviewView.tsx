import { useEffect, useMemo, useRef, useState } from "react";
import { type Artifact, type DiffData, Canvas, FileViewContext, FilePanel, StackContext, TopbarExtras, type PhaseViewProps, type HunkRow, numberLines, useClosed } from "../../../web/plugin-api.ts";
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
import { InlineStatesContext, useInlineStates } from "./inline-state.ts";
import { latestSymbols } from "./symbols.ts";
import { SymbolCard, SymbolMarkContext, type SymbolCardSite } from "./SymbolCard.tsx";

interface OpenSymbolCard { name: string; rect: DOMRect; pinned: boolean }

export function ReviewView({ state, models, drafts, readOnly = false, onSent, onDiscard, onOpenAside }: PhaseViewProps) {
  const [details, setDetails] = useState<DetailsState>(closeDetails);
  const [jump, setJump] = useState<HunkRow | null>(null);
  const [specSelection, setSpecSelection] = useState<SpecStepSelection | null>(null);
  const [symbolCard, setSymbolCard] = useState<OpenSymbolCard | null>(null);
  const symbolTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredSymbol = useRef<string | null>(null);
  const closed = useClosed(state.session.id);
  const inline = useInlineStates(state.session.id);
  const knownDrafts = useRef(new Set(drafts.map((draft) => draft.id)));
  const revealer = useRef<((nodeId: string, collapseId: string) => void) | null>(null);
  const narrative = latestNarrative(state);
  const graph = useMemo(() => reviewGraph(state, drafts), [state, drafts]);
  const diff = latestDiff(state.artifacts);
  const stack = diff && diff.data.commits.length > 1 ? diff.data.commits : null;
  const clearSymbolTimer = () => { if (symbolTimer.current) clearTimeout(symbolTimer.current); symbolTimer.current = null; };
  const symbolMarks = {
    hover: (mark: { name: string } | null, rect: DOMRect | null) => {
      if (!mark || !rect) { hoveredSymbol.current = null; if (!symbolCard?.pinned) { clearSymbolTimer(); symbolTimer.current = setTimeout(() => setSymbolCard(null), 200); } return; }
      if (hoveredSymbol.current === mark.name) return;
      hoveredSymbol.current = mark.name;
      clearSymbolTimer();
      if (symbolCard?.pinned && symbolCard.name === mark.name) return;
      symbolTimer.current = setTimeout(() => setSymbolCard({ name: mark.name, rect, pinned: false }), 300);
    },
    click: (mark: { name: string }, rect: DOMRect) => { hoveredSymbol.current = mark.name; clearSymbolTimer(); setSymbolCard({ name: mark.name, rect, pinned: true }); },
  };
  const epoch = diff ? diffNumber(state.artifacts, diff.id) : null;
  const interdiff = diff ? interdiffOf(state.artifacts, state.links, diff.id) : null;
  const chatThread = useChatLookup(graph, drafts);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { clearSymbolTimer(); setSymbolCard(null); } };
    const outside = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const markedCode = target?.closest("td.code") as HTMLTableCellElement | null;
      if (!target?.closest("[data-testid='symbol-card']") && !(markedCode && getComputedStyle(markedCode).cursor === "pointer")) { clearSymbolTimer(); setSymbolCard(null); }
    };
    document.addEventListener("keydown", key);
    document.addEventListener("click", outside);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("click", outside); clearSymbolTimer(); };
  }, []);
  useEffect(() => {
    for (const draft of drafts) {
      if (knownDrafts.current.has(draft.id)) continue;
      knownDrafts.current.add(draft.id);
      if (!draft.aside) inline.set(draft.id, "expanded");
    }
  }, [drafts, inline.set]);
  useEffect(() => {
    for (const draft of drafts) {
      const thread = draft.taskId ? state.artifacts.find((artifact) => artifact.type === "ChatThread" && artifact.provenance.taskId === draft.taskId) : undefined;
      if (thread) inline.move(draft.id, thread.id);
    }
  }, [drafts, state.artifacts, inline.move]);
  const resolves = (detail: Detail) => detail.kind === "chat" ? chatThread(detail.id) !== null : detail.kind === "comment" ? findComment(graph, detail.id) !== null : detail.kind === "finding" ? findFinding(graph, detail.id) !== null : detail.kind === "phab" ? findPhabThread(graph, detail.anchorId) !== null : detail.kind === "symbol" ? findSymbol(state, diff, detail.name, detail.site) !== null : true;
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
  const selectedSymbol = details.current?.kind === "symbol" ? findSymbol(state, diff, details.current.name, details.current.site) : null;
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
  const symbolData = diff && symbolCard ? latestSymbols(state, diff.id)?.symbols[symbolCard.name] : undefined;
  const symbolSites: SymbolCardSite[] = symbolData?.sites.flatMap((site) => {
    const file = diff?.data.files.find((item) => item.path === site.path);
    const hunk = file?.hunks.find((item) => item.id === site.hunkId);
    if (!hunk) return [];
    const rows = numberLines(hunk);
    const index = rows.findIndex((row) => row.new === site.line);
    if (index < 0) return [];
    const following = [];
    for (const row of rows.slice(index + 1)) { if (row.kind !== "add" || following.length === 2) break; following.push(row); }
    const code = [rows[index]!, ...following].map((row) => row.text);
    return [{ label: `${site.kind === "declaration" ? "declared" : "defined"} in ${site.path}:${site.line}`, code, commit: site.commit }];
  }) ?? [];
  const session = <StackContext.Provider value={stack}><div className="session-body"><SymbolMarkContext.Provider value={symbolMarks}>{body}</SymbolMarkContext.Provider>{panels}{symbolCard && symbolSites.length > 0 && <SymbolCard name={symbolCard.name} sites={symbolSites} rect={symbolCard.rect} stack={!!stack} pinned={symbolCard.pinned} onEnter={clearSymbolTimer} onLeave={() => { if (!symbolCard.pinned) { clearSymbolTimer(); symbolTimer.current = setTimeout(() => setSymbolCard(null), 200); } }} onSite={(site) => { clearSymbolTimer(); setDetails((current) => openDetail(current, { kind: "symbol", name: symbolCard.name, site })); setSymbolCard(null); }} />}</div></StackContext.Provider>;
  return <SpecStepContext.Provider value={details.current?.kind === "spec" ? specSelection : null}>
    <TopbarExtras>{epoch !== null && <span className="epoch" data-testid="epoch">Epoch {epoch}</span>}{diff && <span className="range" title={`${diff.data.baseSha}..${diff.data.headSha}`} data-testid="review-range">Reviewing {diff.data.commits.length} commit{diff.data.commits.length === 1 ? "" : "s"}: {diff.data.baseSha.slice(0, 12)}..{diff.data.headSha.slice(0, 12)}</span>}{interdiff && epoch !== null && <button onClick={() => setDetails((current) => current.current?.kind === "interdiff" ? closeDetails() : openDetail(current, { kind: "interdiff" }))}>Interdiff</button>}</TopbarExtras>
    <InlineStatesContext.Provider value={inline}><DetailsContext.Provider value={{ current: details.current, open: (detail) => { setSpecSelection(null); setDetails((current) => openDetail(current, detail)); } }}>
      {readOnly ? session : <FileViewContext.Provider value={(file) => { if (file.row && narrative) setJump({ hunkId: file.hunkId, ...file.row }); else { setSpecSelection(null); setDetails((current) => openDetail(current, { kind: "file", file })); } }}>{session}</FileViewContext.Provider>}
    </DetailsContext.Provider></InlineStatesContext.Provider>
  </SpecStepContext.Provider>;
}
