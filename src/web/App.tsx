import fixture from "./fixtures/sample-state.json" with { type: "json" };
import type { SessionState } from "../shared/types.ts";
import { Canvas } from "./Canvas.tsx";
import { SessionPicker } from "./SessionPicker.tsx";
import { SessionView } from "./SessionView.tsx";
import { StartScreen } from "./StartScreen.tsx";

const params = new URLSearchParams(location.search);

export function App() {
  if (params.has("fixture")) {
    return <div className="app"><div /><Canvas state={fixture as SessionState} /><div /></div>;
  }
  const session = params.get("session");
  const path = params.get("path");
  return session ? <SessionView sessionId={session} /> : path ? <StartScreen path={path} /> : <SessionPicker />;
}
