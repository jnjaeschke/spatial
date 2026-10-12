import { useEffect, useState } from "react";
import type { RecentRepo, RepoInfo } from "../shared/types.ts";
import { api, useModels } from "./api.ts";
import { SessionList } from "./SessionPicker.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { StartBox } from "./StartBox.tsx";
import { FolderPicker } from "./FolderPicker.tsx";
import { routeUrl } from "./routes.ts";

export function StartScreen({ path }: { path: string }) {
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repos, setRepos] = useState<RecentRepo[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { models, error: modelsError } = useModels();
  useEffect(() => { document.title = repo ? `${repo.name} · spatial` : "spatial"; }, [repo]);
  useEffect(() => { api.repos().then(setRepos, (e: Error) => { console.error(e); setRepos([]); }); }, []);
  useEffect(() => {
    let cancelled = false;
    setRepo(null);
    setError(null);
    api.repo(path).then((value) => { if (!cancelled) setRepo(value); }, (e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [path]);
  const header = <header><h2>{repo?.name ?? "Repository"}{repo && checkoutName(repo) !== repo.name && <span className="checkout-name"> · {checkoutName(repo)}</span>}</h2><button type="button" onClick={() => setPickerOpen(true)}>Open folder…</button><a href="/">All sessions</a><ThemeToggle /></header>;
  // The page is shown once everything above the session list has loaded, so the list does not move under a click.
  if (!repo || !repos || (!models && !modelsError)) return <div className="empty session-picker start-screen">{header}{error ? <p className="failed" data-testid="start-error">{error}</p> : <p className="empty">Loading…</p>}{repos && <RecentRepoSwitcher repos={repos} current={null} />}{pickerOpen && <FolderPicker onClose={() => setPickerOpen(false)} />}</div>;
  return <div className="empty session-picker start-screen" data-testid="start-screen">
    {header}
    {pickerOpen && <FolderPicker onClose={() => setPickerOpen(false)} />}
    <RecentRepoSwitcher repos={repos} current={repo.worktree} />
    <p className="repo-paths"><code>{repo.repoDir}</code> · worktree <code>{repo.worktree}</code></p>
    {models ? <StartBox path={repo.worktree} repoDir={repo.repoDir} models={models} /> : <p className="failed">Models could not be loaded: {modelsError}</p>}
    {error && <p className="failed">{error}</p>}
    <SessionList sessions={repo.sessions} />
  </div>;
}

const checkoutName = (repo: RepoInfo) => repo.worktree.split(/[\\/]/).filter(Boolean).at(-1) ?? repo.worktree;

function RecentRepoSwitcher({ repos, current }: { repos: RecentRepo[]; current: string | null }) {
  return <nav className="repo-switcher" aria-label="Recent repositories">{repos.map((item) => <a key={item.worktree} aria-current={item.worktree === current ? "page" : undefined} href={routeUrl({ kind: "repo", path: item.worktree })}>
    <span>{item.name}</span> <code>{item.worktree}</code>
  </a>)}</nav>;
}
