import { useEffect, useState } from "react";
import type { RepoInfo } from "../shared/types.ts";
import { api, useModels } from "./api.ts";
import { SessionList } from "./SessionPicker.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { StartBox } from "./StartBox.tsx";

export function StartScreen({ path }: { path: string }) {
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const models = useModels();
  useEffect(() => {
    let cancelled = false;
    setRepo(null);
    setError(null);
    api.repo(path).then((value) => { if (!cancelled) setRepo(value); }, (e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [path]);
  if (!repo) return error ? <p className="empty failed" data-testid="start-error">{error}</p> : <p className="empty">Loading…</p>;
  return <div className="empty session-picker start-screen" data-testid="start-screen">
    <header><h2>{repo.name}</h2><a href="/">All sessions</a><ThemeToggle /></header>
    <p className="repo-paths"><code>{repo.repoDir}</code> · worktree <code>{repo.worktree}</code></p>
    {models ? <StartBox path={repo.worktree} models={models} /> : <p className="empty">Loading…</p>}
    {error && <p className="failed">{error}</p>}
    <SessionList sessions={repo.sessions} />
  </div>;
}
