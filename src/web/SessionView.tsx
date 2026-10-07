import { useCallback, useEffect, useMemo, useState } from "react";
import type { Artifact, Ref, SelectorAnswerData, SelectorQuestionData } from "../shared/types.ts";
import { repoName } from "../shared/repos.ts";
import { useSessionState, useModels } from "./api.ts";
import { ActivityStrip } from "./ActivityStrip.tsx";
import { Canvas, type HunkRow } from "./Canvas.tsx";
import { latestNarrative } from "./graph.ts";
import { epochNumber, interdiffOf, latestDiff } from "../shared/epochs.ts";
import { desktopEnabled, disableDesktop, enableDesktop, isStaleNotice } from "./notifications.ts";
import { Toasts } from "./Toasts.tsx";
import { AnalysisStatus } from "./AnalysisStatus.tsx";
import { FilePanel, FileViewContext, type OpenFile } from "./FilePanel.tsx";
import { AskContext, type Draft, type SelectionData } from "./chat-context.ts";
import { AskOnSelect } from "./AskOnSelect.tsx";
import { RevisionView } from "./RevisionView.tsx";
import { InterdiffPanel } from "./InterdiffPanel.tsx";
import { StackContext } from "./stack-context.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { TextSizeControl } from "./TextSizeControl.tsx";
import { ExportDialog } from "./ExportDialog.tsx";
import { SelectorQuestion } from "./SelectorQuestion.tsx";

export function SessionView({ sessionId }: { sessionId: string }) {
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [aside, setAside] = useState<"file" | "interdiff" | null>(null);
  const [jump, setJump] = useState<HunkRow | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [desktop, setDesktop] = useState(desktopEnabled);
  const [exporting, setExporting] = useState(false);
  const { state, error, progress, notices, dismissNotice } = useSessionState(sessionId);
  const models = useModels();
  useEffect(() => {
    if (!state) return;
    const completed = new Set(state.artifacts.filter((a) => a.type === "ChatThread").map((a) => a.provenance.taskId));
    setDrafts((current) => current.filter((d) => !d.taskId || !completed.has(d.taskId)));
  }, [state]);
  const ask = useCallback((anchor: Ref, selection?: SelectionData) => {
    const id = `draft-${crypto.randomUUID()}`;
    setDrafts((current) => [...current, { id, anchor, ...selection }]);
  }, []);
  const askContext = useMemo(() => ({ ask }), [ask]);
  const onSent = useCallback((draftId: string, taskId: string) => setDrafts((current) => current.map((d) => d.id === draftId ? { ...d, taskId } : d)), []);
  const onOpenAside = useCallback((draft: Draft) => setDrafts((current) => [...current, draft]), []);
  if (error) return <p className="empty failed">{error}</p>;
  if (!state || !models) return <p className="empty">Loading…</p>;
  const n = latestNarrative(state);
  const diff = latestDiff(state.artifacts);
  const stack = diff && diff.data.commits.length > 1 ? diff.data.commits : null;
  const epoch = diff ? epochNumber(state.artifacts, diff.id) : null;
  const interdiff = diff ? interdiffOf(state.artifacts, state.links, diff.id) : null;
  const visible = notices.filter((notice) => !isStaleNotice(notice, diff));
  const selecting = state.tasks.filter((t) => t.kind === "selectWorkflow").at(-1);
  const question = state.artifacts.findLast((a) => a.type === "SelectorQuestion") as Artifact<SelectorQuestionData> | undefined;
  const openQuestion = question && selecting?.status === "succeeded" && !state.artifacts.some((a) => a.type === "SelectorAnswer" && (a.data as SelectorAnswerData).question === question.id) ? question : null;
  const body = state.session.workflow === null && openQuestion
    ? <SelectorQuestion sessionId={sessionId} question={openQuestion} llm={models.default} />
    : state.session.workflow === null
    ? <p className={`empty${selecting?.status === "failed" ? " failed" : ""}`} data-testid="selecting">{selecting?.status === "failed" ? `Could not choose a workflow: ${selecting.error}` : "Choosing a workflow…"}</p>
      : state.session.workflow === "chat" ? <Canvas jump={jump} state={state} models={models} drafts={drafts} onSent={onSent} onOpenAside={onOpenAside} onDiscard={(id) => setDrafts((current) => current.filter((draft) => draft.id !== id))} />
      : n ? <Canvas jump={jump} state={state} models={models} drafts={drafts} onSent={onSent} onOpenAside={onOpenAside} onDiscard={(id) => setDrafts((current) => current.filter((draft) => draft.id !== id))} /> : diff && epoch !== null ? <RevisionView sessionId={sessionId} diff={diff} epoch={epoch} state={state} models={models} /> : <AnalysisStatus state={state} models={models} />;
  return <div className="app">
    <div className="topbar"><a className="back" href={`/?path=${encodeURIComponent(state.session.worktree)}`}>{repoName(state.session.repoDir)}</a><b className="session-title">{state.session.title}</b><code className="repo">{state.session.worktree}</code>{state.session.workflow === "review" && <>{epoch !== null && <span className="epoch" data-testid="epoch">Epoch {epoch}</span>}{diff && <span className="range" title={`${diff.data.baseSha}..${diff.data.headSha}`} data-testid="review-range">Reviewing {diff.data.commits.length} commit{diff.data.commits.length === 1 ? "" : "s"}: {diff.data.baseSha.slice(0, 12)}..{diff.data.headSha.slice(0, 12)}</span>}{interdiff && epoch !== null && <button onClick={() => { setAside(aside === "interdiff" ? null : "interdiff"); setOpenFile(null); }}>Interdiff</button>}</>}<span className="spacer" />{(state.session.workflow === "chat" || n) && <button type="button" onClick={() => setExporting(true)}>Export…</button>}<label className="desktop-toggle"><input type="checkbox" aria-label="Desktop notifications" checked={desktop} onChange={(event) => {
      if (event.currentTarget.checked) void enableDesktop().then(setDesktop);
      else { disableDesktop(); setDesktop(false); }
    }} /> Desktop notifications</label><TextSizeControl /><ThemeToggle /></div>
    <AskContext.Provider value={askContext}><FileViewContext.Provider value={(file) => { setOpenFile(file); setAside("file"); }}>
      <StackContext.Provider value={stack}><div className="session-body">
        {body}
        {aside === "interdiff" && interdiff && epoch !== null ? <InterdiffPanel interdiff={interdiff} epoch={epoch} onClose={() => setAside(null)} /> : aside === "file" && diff && openFile?.diffId === diff.id && <FilePanel sessionId={sessionId} diff={diff} open={openFile} onClose={() => { setOpenFile(null); setAside(null); }} onJump={setJump} />}
      </div></StackContext.Provider>
      <AskOnSelect />
    </FileViewContext.Provider></AskContext.Provider>
    <ActivityStrip tasks={state.tasks} progress={progress} />
    <Toasts items={visible} onDismiss={dismissNotice} />
    {exporting && <ExportDialog state={state} onClose={() => setExporting(false)} />}
  </div>;
}
