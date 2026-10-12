import { useCallback, useEffect, useMemo, useState } from "react";
import type { Ref } from "../shared/types.ts";
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
import { NodeKindsContext, TopbarSlot } from "./plugin-api.ts";
import { activePhaseView, sessionViews } from "./phase-views.ts";
import { webNodeKinds, webPlugins } from "../plugins/web.ts";
import { ModelsContext } from "./DecisionControls.tsx";
import { EpochStrip } from "./EpochStrip.tsx";
import { showEpochStrip, stateAtEpoch } from "./epochs.ts";
import { RouteContext, routeUrl, sessionViewOf, showSessionView } from "./routes.ts";
import { Segmented } from "./Segmented.tsx";
import { ReplyActionsContext, derivedArtifacts } from "./reply-actions.ts";
import { webConversationItems, webReplyActions } from "../plugins/web.ts";
import { ConversationItemsContext } from "./conversation-items.ts";
import { OpenActivityLogContext, type OpenLog } from "./activity-log-context.ts";

export function SessionView({ sessionId }: { sessionId: string }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [desktop, setDesktop] = useState(desktopEnabled);
  const [exporting, setExporting] = useState(false);
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  const [viewed, setViewed] = useState<number | null>(null);
  const [log, setLog] = useState<OpenLog | null>(null);
  const { state, error, progress, notices, dismissNotice } = useSessionState(sessionId);
  const { models, error: modelsError } = useModels();
  const [viewId, setViewId] = useState(() => sessionViewOf(new URL(location.href)));
  useEffect(() => {
    const update = () => setViewId(sessionViewOf(new URL(location.href)));
    navigation.addEventListener("currententrychange", update);
    return () => navigation.removeEventListener("currententrychange", update);
  }, []);
  const [titleParts, setTitleParts] = useState<string[]>([]);
  const route = useMemo(() => ({ sessionId, setTitleParts }), [sessionId]);
  const title = state ? [...titleParts, state.session.title, "spatial"].join(" · ") : "spatial";
  useEffect(() => { document.title = title; }, [title]);
  useEffect(() => {
    if (!state) return;
    const completed = new Set(state.artifacts.filter((a) => a.type === "ChatThread").map((a) => a.provenance.taskId));
    setDrafts((current) => current.filter((d) => !d.taskId || !completed.has(d.taskId)));
  }, [state]);
  const ask = useCallback((anchor: Ref, selection?: SelectionData) => {
    const id = `draft-${crypto.randomUUID()}`;
    setDrafts((current) => [...current, { id, anchor, ...selection }]);
  }, []);
  const comment = useCallback((anchor: Ref, selection: SelectionData) => {
    const id = `comment-${crypto.randomUUID()}`;
    setDrafts((current) => [...current, { id, anchor, kind: "comment", ...selection }]);
  }, []);
  const onSent = useCallback((draftId: string, taskId: string) => setDrafts((current) => current.map((d) => d.id === draftId ? { ...d, taskId } : d)), []);
  const onOpenAside = useCallback((draft: Draft) => setDrafts((current) => [...current, draft]), []);
  const commentsOnSelection = state ? activePhaseView(webPlugins, state).view?.commentsOnSelection === true : false;
  const askContext = useMemo(() => ({ ask, ...(commentsOnSelection ? { comment } : {}) }), [ask, comment, commentsOnSelection]);
  const replyActions = useMemo(() => state && { sessionId, components: webReplyActions, derived: (messageId: string) => derivedArtifacts(state, messageId) }, [sessionId, state]);
  if (error) return <p className="empty failed">{error}</p>;
  if (modelsError) return <p className="empty failed">Models could not be loaded: {modelsError}</p>;
  if (!state || !models) return <p className="empty">Loading…</p>;
  const latestEpoch = state.epochs.at(-1) ?? null;
  const past = viewed !== null && viewed !== latestEpoch?.n ? state.epochs.find((e) => e.n === viewed) ?? null : null;
  const shown = past ? stateAtEpoch(state, past.n) : state;
  const conversationItems = { components: webConversationItems, artifacts: shown.artifacts, sessionId, repoDir: state.session.repoDir, worktree: state.session.worktree };
  const { phase, view } = activePhaseView(webPlugins, shown);
  const extra = sessionViews(webPlugins, shown, viewId);
  const Body = extra.active?.Body ?? view?.Body;
  const body = Body ? <Body state={shown} models={models} drafts={drafts} epoch={past ?? latestEpoch} readOnly={past !== null} onSent={onSent} onOpenAside={onOpenAside} onDiscard={(id) => setDrafts((current) => current.filter((draft) => draft.id !== id))} />
    : <p className="empty failed">No view for phase {phase}</p>;
  const visible = notices.filter((notice) => !view?.isStaleNotice?.(state, notice));
  return <RouteContext.Provider value={route}><div className="app">
    <div className="topbar"><a className="back" href={routeUrl({ kind: "repo", path: state.session.worktree })}>{repoName(state.session.repoDir)}</a><b className="session-title">{state.session.title}</b><code className="repo" title={state.session.worktree}>{state.session.worktree}</code><span className="topbar-extras" ref={setTopbarSlot} />{extra.available.length > 0 && <Segmented label="Session view" className="session-views" options={[{ value: "", label: phase ?? "phase", title: "Phase view" }, ...extra.available.map((candidate) => ({ value: candidate.id, label: candidate.label, title: candidate.label }))]} value={extra.active?.id ?? ""} onChange={(id) => showSessionView(id || null)} />}<span className="spacer" />{!extra.active && view?.exportable?.(state) && <button type="button" onClick={() => setExporting(true)}>Export…</button>}<label className="desktop-toggle"><input type="checkbox" aria-label="Desktop notifications" checked={desktop} onChange={(event) => {
      if (event.currentTarget.checked) void enableDesktop().then(setDesktop);
      else { disableDesktop(); setDesktop(false); }
    }} /> Desktop notifications</label><TextSizeControl /><ThemeToggle /></div>
    {showEpochStrip(state) && <EpochStrip state={state} viewed={viewed} onView={setViewed} />}
    <OpenActivityLogContext.Provider value={setLog}><ModelsContext.Provider value={models}><NodeKindsContext.Provider value={webNodeKinds}><AskContext.Provider value={askContext}><TopbarSlot.Provider value={topbarSlot}><ReplyActionsContext.Provider value={replyActions}><ConversationItemsContext.Provider value={conversationItems}>{body}<AskOnSelect /><ActivityStrip state={state} view={view ?? null} progress={progress} log={log} onLog={setLog} /></ConversationItemsContext.Provider></ReplyActionsContext.Provider></TopbarSlot.Provider></AskContext.Provider></NodeKindsContext.Provider></ModelsContext.Provider></OpenActivityLogContext.Provider>
    <Toasts items={visible} onDismiss={dismissNotice} />
    {exporting && <ExportDialog state={state} diff={view?.exportDiff?.(state) ?? null} onClose={() => setExporting(false)} />}
  </div></RouteContext.Provider>;
}
