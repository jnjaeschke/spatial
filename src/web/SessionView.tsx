import { useCallback, useEffect, useMemo, useState } from "react";
import type { Artifact, Ref, SelectorAnswerData, SelectorQuestionData } from "../shared/types.ts";
import { repoName } from "../shared/repos.ts";
import { useSessionState, useModels } from "./api.ts";
import { ActivityStrip } from "./ActivityStrip.tsx";
import { desktopEnabled, disableDesktop, enableDesktop } from "./notifications.ts";
import { Toasts } from "./Toasts.tsx";
import { AskContext, type Draft, type SelectionData } from "./chat-context.ts";
import { AskOnSelect } from "./AskOnSelect.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { TextSizeControl } from "./TextSizeControl.tsx";
import { ExportDialog } from "./ExportDialog.tsx";
import { SelectorQuestion } from "./SelectorQuestion.tsx";
import { NodeKindsContext, TopbarSlot } from "./plugin-api.ts";
import { activePhaseView } from "./phase-views.ts";
import { webNodeKinds, webPlugins } from "../plugins/web.ts";

export function SessionView({ sessionId }: { sessionId: string }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [desktop, setDesktop] = useState(desktopEnabled);
  const [exporting, setExporting] = useState(false);
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
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
  const selecting = state.tasks.filter((t) => t.kind === "selectWorkflow").at(-1);
  const question = state.artifacts.findLast((a) => a.type === "SelectorQuestion") as Artifact<SelectorQuestionData> | undefined;
  const openQuestion = question && selecting?.status === "succeeded" && !state.artifacts.some((a) => a.type === "SelectorAnswer" && (a.data as SelectorAnswerData).question === question.id) ? question : null;
  const { phase, view } = activePhaseView(webPlugins, state);
  const body = state.session.workflow === null && openQuestion
    ? <SelectorQuestion sessionId={sessionId} question={openQuestion} llm={models.default} />
    : state.session.workflow === null
      ? <p className={`empty${selecting?.status === "failed" ? " failed" : ""}`} data-testid="selecting">{selecting?.status === "failed" ? `Could not choose a workflow: ${selecting.error}` : "Choosing a workflow…"}</p>
      : view ? <view.Body state={state} models={models} drafts={drafts} onSent={onSent} onOpenAside={onOpenAside} onDiscard={(id) => setDrafts((current) => current.filter((draft) => draft.id !== id))} />
        : <p className="empty failed">No view for phase {phase}</p>;
  const visible = notices.filter((notice) => !view?.isStaleNotice?.(state, notice));
  return <div className="app">
    <div className="topbar"><a className="back" href={`/?path=${encodeURIComponent(state.session.worktree)}`}>{repoName(state.session.repoDir)}</a><b className="session-title">{state.session.title}</b><code className="repo">{state.session.worktree}</code><span className="topbar-extras" ref={setTopbarSlot} /><span className="spacer" />{view?.exportable?.(state) && <button type="button" onClick={() => setExporting(true)}>Export…</button>}<label className="desktop-toggle"><input type="checkbox" aria-label="Desktop notifications" checked={desktop} onChange={(event) => {
      if (event.currentTarget.checked) void enableDesktop().then(setDesktop);
      else { disableDesktop(); setDesktop(false); }
    }} /> Desktop notifications</label><TextSizeControl /><ThemeToggle /></div>
    <NodeKindsContext.Provider value={webNodeKinds}><AskContext.Provider value={askContext}><TopbarSlot.Provider value={topbarSlot}>{body}<AskOnSelect /></TopbarSlot.Provider></AskContext.Provider></NodeKindsContext.Provider>
    <ActivityStrip tasks={state.tasks} progress={progress} />
    <Toasts items={visible} onDismiss={dismissNotice} />
    {exporting && <ExportDialog state={state} diff={view?.exportDiff?.(state) ?? null} onClose={() => setExporting(false)} />}
  </div>;
}
