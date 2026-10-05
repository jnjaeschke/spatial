import fixture from "./fixtures/sample-state.json" with { type: "json" };
import type { SessionState } from "../shared/types.ts";
import { Canvas } from "./Canvas.tsx";
import { SessionPicker } from "./SessionPicker.tsx";
import { SessionView } from "./SessionView.tsx";

const params = new URLSearchParams(location.search);

export function App() {
  if (params.has("fixture")) {
    return <div className="app"><div /><Canvas state={fixture as SessionState} /><div /></div>;
  }
  const session = params.get("session");
  return session ? <SessionView sessionId={session} /> : <SessionPicker />;
}
