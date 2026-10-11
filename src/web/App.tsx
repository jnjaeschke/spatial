import { useEffect, useState } from "react";
import fixture from "./fixtures/sample-state.json" with { type: "json" };
import type { SessionState } from "../shared/types.ts";
import { NodeKindsContext, TopbarSlot } from "./plugin-api.ts";
import { activePhaseView, readOnlyViewProps } from "./phase-views.ts";
import { SessionPicker } from "./SessionPicker.tsx";
import { SessionView } from "./SessionView.tsx";
import { StartScreen } from "./StartScreen.tsx";
import { ExportView } from "./ExportView.tsx";
import { exported } from "./exported.ts";
import { nav, parseRoute, type Route } from "./routes.ts";
import { webNodeKinds, webPlugins } from "../plugins/web.ts";

export function App() {
  if (exported) return <ExportView data={exported} />;
  return <LiveApp />;
}

function LiveApp() {
  const [route, setRoute] = useState<Route | null>(() => parseRoute(new URL(location.href)));
  useEffect(() => {
    if (!nav) return;
    const onNavigate = (event: NavigateEvent) => {
      if (!event.canIntercept || event.downloadRequest || event.hashChange) return;
      const next = parseRoute(new URL(event.destination.url));
      if (!next) return;
      event.intercept({ focusReset: "manual", scroll: "manual", handler: async () => {
        setRoute((current) => current?.kind === "session" && next.kind === "session" && current.sessionId === next.sessionId ? current : next);
      } });
    };
    nav.addEventListener("navigate", onNavigate);
    return () => nav!.removeEventListener("navigate", onNavigate);
  }, []);
  if (route?.kind === "fixture") {
    const state = fixture as SessionState;
    const { view } = activePhaseView(webPlugins, state);
    return <div className="app"><div /><NodeKindsContext.Provider value={webNodeKinds}><TopbarSlot.Provider value={null}>{view ? <view.Body {...readOnlyViewProps(state)} /> : null}</TopbarSlot.Provider></NodeKindsContext.Provider><div /></div>;
  }
  if (route?.kind === "repo") return <StartScreen key={route.path} path={route.path} />;
  if (route?.kind === "session") return <SessionView key={route.sessionId} sessionId={route.sessionId} />;
  return <SessionPicker />;
}
