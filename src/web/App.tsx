import fixture from "./fixtures/sample-state.json" with { type: "json" };
import type { SessionState } from "../shared/types.ts";
import { Canvas } from "./Canvas.tsx";
import { latestNarrative } from "./graph.ts";

const params = new URLSearchParams(location.search);

export function App() {
  if (params.has("fixture")) {
    const n = latestNarrative(fixture as SessionState)!;
    return <div className="app"><div /><Canvas narrative={n.narrative} diff={n.diff} /><div /></div>;
  }
  return <p className="empty">Live sessions arrive in the next task. Open <code>?fixture=1</code>.</p>;
}
