import { useSessionState, useModels } from "./api.ts";
import { ActivityStrip } from "./ActivityStrip.tsx";
import { Canvas } from "./Canvas.tsx";
import { latestNarrative } from "./graph.ts";
import { NarrateForm } from "./NarrateForm.tsx";

export function SessionView({ sessionId }: { sessionId: string }) {
  const { state, error, progress } = useSessionState(sessionId);
  const models = useModels();
  if (error) return <p className="empty failed">{error}</p>;
  if (!state || !models) return <p className="empty">Loading…</p>;
  const n = latestNarrative(state);
  const busy = state.tasks.some((t) => (t.kind === "importDiff" || t.kind === "narrate") && (t.status === "running" || t.status === "pending"));
  return <div className="app">
    <div className="topbar"><a href="/">Sessions</a><b>{state.session.title}</b><code>{state.session.repo}</code><NarrateForm sessionId={sessionId} models={models} busy={busy} /></div>
    {n ? <Canvas sessionId={sessionId} narrative={n.narrative} diff={n.diff} /> : <p className="empty">No narrative yet. Pick a range and press Narrate.</p>}
    <ActivityStrip tasks={state.tasks} progress={progress} />
  </div>;
}
