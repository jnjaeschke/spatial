import { useCallback, useEffect, useMemo, useState } from "react";
import type { Ref } from "../shared/types.ts";
import { useSessionState, useModels } from "./api.ts";
import { ActivityStrip } from "./ActivityStrip.tsx";
import { Canvas } from "./Canvas.tsx";
import { latestNarrative } from "./graph.ts";
import { latestDiff } from "../shared/epochs.ts";
import { desktopEnabled, disableDesktop, enableDesktop, isStaleNotice } from "./notifications.ts";
import { Toasts } from "./Toasts.tsx";
import { NarrateForm } from "./NarrateForm.tsx";
import { FilePanel, FileViewContext, type OpenFile } from "./FilePanel.tsx";
import { AskContext, type Draft, type SelectionData } from "./chat-context.ts";
import { AskOnSelect } from "./AskOnSelect.tsx";

export function SessionView({ sessionId }: { sessionId: string }) {
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [desktop, setDesktop] = useState(desktopEnabled);
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
  if (error) return <p className="empty failed">{error}</p>;
  if (!state || !models) return <p className="empty">Loading…</p>;
  const n = latestNarrative(state);
  const latest = latestDiff(state.artifacts);
  const visible = notices.filter((notice) => !isStaleNotice(notice, latest));
  const busy = state.tasks.some((t) => (t.kind === "importDiff" || t.kind === "narrate") && (t.status === "running" || t.status === "pending"));
  return <div className="app">
    <div className="topbar"><a href="/">Sessions</a><b>{state.session.title}</b><code>{state.session.repo}</code>{!n && <NarrateForm sessionId={sessionId} models={models} busy={busy} />}<label><input type="checkbox" aria-label="Desktop notifications" checked={desktop} onChange={(event) => {
      if (event.currentTarget.checked) void enableDesktop().then(setDesktop);
      else { disableDesktop(); setDesktop(false); }
    }} /> Desktop notifications</label></div>
    <AskContext.Provider value={askContext}><FileViewContext.Provider value={setOpenFile}>
      <div className="session-body">
        {n ? <Canvas state={state} models={models} drafts={drafts} onSent={onSent} /> : <p className="empty">No narrative yet. Pick a range and press Narrate.</p>}
        {n && openFile?.diffId === n.diff.id && <FilePanel sessionId={sessionId} diff={n.diff} open={openFile} onClose={() => setOpenFile(null)} />}
      </div>
      <AskOnSelect />
    </FileViewContext.Provider></AskContext.Provider>
    <ActivityStrip tasks={state.tasks} progress={progress} />
    <Toasts items={visible} onDismiss={dismissNotice} />
  </div>;
}
