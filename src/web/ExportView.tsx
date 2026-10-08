import { useState } from "react";
import { repoName } from "../shared/repos.ts";
import { diffNumber, interdiffOf, latestDiff } from "../shared/diffs.ts";
import type { SessionExport } from "./export-state.ts";
import { Canvas, type HunkRow } from "./Canvas.tsx";
import { FilePanel, FileViewContext, type OpenFile } from "./FilePanel.tsx";
import { InterdiffPanel } from "./InterdiffPanel.tsx";
import { StackContext } from "./stack-context.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { TextSizeControl } from "./TextSizeControl.tsx";

/** A session from a static export file: the canvas without chat, decisions or posting. */
export function ExportView({ data }: { data: SessionExport }) {
  const { state } = data;
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [aside, setAside] = useState<"file" | "interdiff" | null>(null);
  const [jump, setJump] = useState<HunkRow | null>(null);
  const diff = latestDiff(state.artifacts);
  const stack = diff && diff.data.commits.length > 1 ? diff.data.commits : null;
  const epoch = diff ? diffNumber(state.artifacts, diff.id) : null;
  const interdiff = diff ? interdiffOf(state.artifacts, state.links, diff.id) : null;
  return <div className="app">
    <div className="topbar"><span className="back">{repoName(state.session.repoDir)}</span><b className="session-title">{state.session.title}</b><code className="repo">{state.session.worktree}</code>{epoch !== null && <span className="epoch" data-testid="epoch">Epoch {epoch}</span>}{diff && <span className="range" title={`${diff.data.baseSha}..${diff.data.headSha}`}>Reviewing {diff.data.commits.length} commit{diff.data.commits.length === 1 ? "" : "s"}: {diff.data.baseSha.slice(0, 12)}..{diff.data.headSha.slice(0, 12)}</span>}{interdiff && epoch !== null && <button onClick={() => { setAside(aside === "interdiff" ? null : "interdiff"); setOpenFile(null); }}>Interdiff</button>}<span className="spacer" /><span className="export-badge" data-testid="export-badge">Read-only export · {new Date(data.exportedAt).toLocaleString()}</span><TextSizeControl /><ThemeToggle /></div>
    <FileViewContext.Provider value={(file) => { setOpenFile(file); setAside("file"); }}>
      <StackContext.Provider value={stack}><div className="session-body">
        <Canvas jump={jump} state={state} />
        {aside === "interdiff" && interdiff && epoch !== null ? <InterdiffPanel interdiff={interdiff} epoch={epoch} onClose={() => setAside(null)} /> : aside === "file" && diff && openFile?.diffId === diff.id && <FilePanel sessionId={state.session.id} diff={diff} open={openFile} onClose={() => { setOpenFile(null); setAside(null); }} onJump={setJump} />}
      </div></StackContext.Provider>
    </FileViewContext.Provider>
  </div>;
}
