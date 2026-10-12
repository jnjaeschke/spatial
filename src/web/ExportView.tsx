import { useState } from "react";
import { repoName } from "../shared/repos.ts";
import type { SessionExport } from "./export-state.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { TextSizeControl } from "./TextSizeControl.tsx";
import { NodeKindsContext, TopbarSlot } from "./plugin-api.ts";
import { activePhaseView, readOnlyViewProps } from "./phase-views.ts";
import { SearchfoxProvider } from "./SearchfoxProvider.tsx";
import { webNodeKinds, webPlugins } from "../plugins/web.ts";

/** A session snapshot rendered by its registered phase view. */
export function ExportView({ data }: { data: SessionExport }) {
  const { state } = data;
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const { phase, view } = activePhaseView(webPlugins, state);
  return <div className="app">
    <div className="topbar"><span className="back">{repoName(state.session.repoDir)}</span><b className="session-title">{state.session.title}</b><code className="repo">{state.session.worktree}</code><span className="topbar-extras" ref={setSlot} /><span className="spacer" /><span className="export-badge" data-testid="export-badge">Read-only export · {new Date(data.exportedAt).toLocaleString()}</span><TextSizeControl /><ThemeToggle /></div>
    <NodeKindsContext.Provider value={webNodeKinds}><TopbarSlot.Provider value={slot}><SearchfoxProvider state={state} readOnly>{view ? <view.Body {...readOnlyViewProps(state)} /> : <p className="empty failed">No view for phase {phase}</p>}</SearchfoxProvider></TopbarSlot.Provider></NodeKindsContext.Provider>
  </div>;
}
