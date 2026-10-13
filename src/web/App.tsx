import { useEffect, useState } from "react";
import fixture from "./fixtures/sample-state.json" with { type: "json" };
import type { SessionState } from "../shared/types.ts";
import { NodeKindsContext, TopbarSlot } from "./plugin-api.ts";
import { activePhaseView, readOnlyViewProps } from "./phase-views.ts";
import { SessionProviders } from "./SessionProviders.tsx";
import { SessionPicker } from "./SessionPicker.tsx";
import { SessionView } from "./SessionView.tsx";
import { StartScreen } from "./StartScreen.tsx";
import { RepoViewPage } from "./RepoViewPage.tsx";
import { ExportView } from "./ExportView.tsx";
import { exported } from "./exported.ts";
import { parseRoute, type Route } from "./routes.ts";
import { webNodeKinds, webPlugins, webRepoPanels, webRepoViews } from "../plugins/web.ts";

export function App() {
  if (exported) return <ExportView data={exported} />;
  return <LiveApp />;
}

function LiveApp() {
  const [route, setRoute] = useState<Route | null>(() => parseRoute(new URL(location.href)));
  useEffect(() => {
    const onNavigate = (event: NavigateEvent) => {
      if (!event.canIntercept || event.downloadRequest || event.hashChange) return;
      const next = parseRoute(new URL(event.destination.url));
      if (!next) return;
      event.intercept({ focusReset: "manual", scroll: "manual", handler: async () => {
        setRoute((current) => current?.kind === "session" && next.kind === "session" && current.sessionId === next.sessionId ? current
          : current?.kind === "repoView" && next.kind === "repoView" && current.path === next.path && current.view === next.view ? current : next);
      } });
    };
    navigation.addEventListener("navigate", onNavigate);
    return () => navigation.removeEventListener("navigate", onNavigate);
  }, []);
  if (route?.kind === "fixture") {
    const state = fixture as SessionState;
    const { view } = activePhaseView(webPlugins, state);
    return <div className="app"><div /><NodeKindsContext.Provider value={webNodeKinds}><TopbarSlot.Provider value={null}><SessionProviders state={state} readOnly>{view ? <view.Body {...readOnlyViewProps(state)} /> : null}</SessionProviders></TopbarSlot.Provider></NodeKindsContext.Provider><div /></div>;
  }
  if (route?.kind === "repoView") return <RepoViewPage key={`${route.path}\0${route.view}`} path={route.path} view={route.view} views={webRepoViews} />;
  if (route?.kind === "repo") return <StartScreen key={route.path} path={route.path} panels={webRepoPanels} views={webRepoViews} />;
  if (route?.kind === "session") return <SessionView key={route.sessionId} sessionId={route.sessionId} />;
  return <SessionPicker />;
}
