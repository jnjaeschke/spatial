import { useEffect, useState } from "react";
import type { RecentRepo, RepoInfo } from "../shared/types.ts";
import { api, useModels } from "./api.ts";
import { SessionList } from "./SessionPicker.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { StartBox } from "./StartBox.tsx";
import { FolderPicker } from "./FolderPicker.tsx";

export function StartScreen({ path }: { path: string }) {
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repos, setRepos] = useState<RecentRepo[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const models = useModels();
  useEffect(() => { api.repos().then(setRepos, (e: Error) => console.error(e)); }, []);
  useEffect(() => {
    let cancelled = false;
    setRepo(null);
    setError(null);
    api.repo(path).then((value) => { if (!cancelled) setRepo(value); }, (e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [path]);
  const header = <header><h2>{repo?.name ?? "Repository"}</h2><button type="button" onClick={() => setPickerOpen(true)}>Open folder…</button><a href="/">All sessions</a><ThemeToggle /></header>;
  if (!repo) return <div className="empty session-picker start-screen">{header}{error ? <p className="failed" data-testid="start-error">{error}</p> : <p className="empty">Loading…</p>}<RecentRepoSwitcher repos={repos} current={null} />{pickerOpen && <FolderPicker onClose={() => setPickerOpen(false)} />}</div>;
  return <div className="empty session-picker start-screen" data-testid="start-screen">
    {header}
    {pickerOpen && <FolderPicker onClose={() => setPickerOpen(false)} />}
    <RecentRepoSwitcher repos={repos} current={repo.repoDir} />
    <p className="repo-paths"><code>{repo.repoDir}</code> · worktree <code>{repo.worktree}</code></p>
    {models ? <StartBox path={repo.worktree} models={models} /> : <p className="empty">Loading…</p>}
    {error && <p className="failed">{error}</p>}
    <SessionList sessions={repo.sessions} />
  </div>;
}

function RecentRepoSwitcher({ repos, current }: { repos: RecentRepo[]; current: string | null }) {
  return <nav className="repo-switcher" aria-label="Recent repositories">{repos.map((item) => <a key={item.repoDir} aria-current={item.repoDir === current ? "page" : undefined} href={`?path=${encodeURIComponent(item.worktree)}`}>
    <span>{item.name}</span> <code>{item.worktree}</code>
  </a>)}</nav>;
}
