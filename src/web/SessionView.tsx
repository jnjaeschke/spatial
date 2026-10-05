import { useState } from "react";
import { useSessionState, useModels } from "./api.ts";
import { ActivityStrip } from "./ActivityStrip.tsx";
import { Canvas } from "./Canvas.tsx";
import { latestNarrative } from "./graph.ts";
import { NarrateForm } from "./NarrateForm.tsx";
import { FilePanel, FileViewContext, type OpenFile } from "./FilePanel.tsx";

export function SessionView({ sessionId }: { sessionId: string }) {
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const { state, error, progress } = useSessionState(sessionId);
  const models = useModels();
  if (error) return <p className="empty failed">{error}</p>;
  if (!state || !models) return <p className="empty">Loading…</p>;
  const n = latestNarrative(state);
  const busy = state.tasks.some((t) => (t.kind === "importDiff" || t.kind === "narrate") && (t.status === "running" || t.status === "pending"));
  return <div className="app">
    <div className="topbar"><a href="/">Sessions</a><b>{state.session.title}</b><code>{state.session.repo}</code><NarrateForm sessionId={sessionId} models={models} busy={busy} /></div>
    <FileViewContext.Provider value={setOpenFile}>
      <div className="session-body">
        {n ? <Canvas state={state} /> : <p className="empty">No narrative yet. Pick a range and press Narrate.</p>}
        {n && openFile?.diffId === n.diff.id && <FilePanel sessionId={sessionId} diff={n.diff} open={openFile} onClose={() => setOpenFile(null)} />}
      </div>
    </FileViewContext.Provider>
    <ActivityStrip tasks={state.tasks} progress={progress} />
  </div>;
}
