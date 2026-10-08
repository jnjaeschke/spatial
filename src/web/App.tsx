import fixture from "./fixtures/sample-state.json" with { type: "json" };
import type { SessionState } from "../shared/types.ts";
import { NodeKindsContext, TopbarSlot } from "./plugin-api.ts";
import { activePhaseView, readOnlyViewProps } from "./phase-views.ts";
import { SessionPicker } from "./SessionPicker.tsx";
import { SessionView } from "./SessionView.tsx";
import { StartScreen } from "./StartScreen.tsx";
import { ExportView } from "./ExportView.tsx";
import { exported } from "./exported.ts";
import { webNodeKinds, webPlugins } from "../plugins/web.ts";

const params = new URLSearchParams(location.search);

export function App() {
  if (exported) return <ExportView data={exported} />;
  if (params.has("fixture")) {
    const state = fixture as SessionState;
    const { view } = activePhaseView(webPlugins, state);
    return <div className="app"><div /><NodeKindsContext.Provider value={webNodeKinds}><TopbarSlot.Provider value={null}>{view ? <view.Body {...readOnlyViewProps(state)} /> : null}</TopbarSlot.Provider></NodeKindsContext.Provider><div /></div>;
  }
  const session = params.get("session");
  const path = params.get("path");
  return session ? <SessionView sessionId={session} /> : path ? <StartScreen path={path} /> : <SessionPicker />;
}
