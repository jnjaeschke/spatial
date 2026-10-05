import fixture from "./fixtures/sample-state.json" with { type: "json" };
import type { SessionState } from "../shared/types.ts";
import { Canvas } from "./Canvas.tsx";
import { latestNarrative } from "./graph.ts";
import { SessionPicker } from "./SessionPicker.tsx";
import { SessionView } from "./SessionView.tsx";

const params = new URLSearchParams(location.search);

export function App() {
  if (params.has("fixture")) {
    const n = latestNarrative(fixture as SessionState)!;
    return <div className="app"><div /><Canvas sessionId={fixture.session.id} narrative={n.narrative} diff={n.diff} /><div /></div>;
  }
  const session = params.get("session");
  return session ? <SessionView sessionId={session} /> : <SessionPicker />;
}
