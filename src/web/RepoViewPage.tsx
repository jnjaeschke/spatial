import { useEffect, useState } from "react";
import type { RepoInfo } from "../shared/types.ts";
import { api } from "./api.ts";
import type { PluginRepoView } from "./plugin-api.ts";
import { routeUrl } from "./routes.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { UsageWidget } from "./UsageWidget.tsx";

/** A plugin's repository page: a header linking back to the repo page, then the view. */
export function RepoViewPage({ path, view, views }: { path: string; view: string; views: PluginRepoView[] }) {
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const found = views.find((candidate) => candidate.id === view);
  useEffect(() => {
    let cancelled = false;
    api.repo(path).then((value) => { if (!cancelled) setRepo(value); }, (e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [path]);
  useEffect(() => { document.title = `${found?.label ?? view} · ${repo?.name ?? "spatial"}`; }, [found, view, repo]);
  return <div className="repo-view-page" data-testid="repo-view-page">
    <header><h2>{repo ? <a href={routeUrl({ kind: "repo", path: repo.worktree })}>{repo.name}</a> : "Repository"} · {found?.label ?? view}</h2><UsageWidget /><ThemeToggle /></header>
    <div className="repo-view-body">{error ? <p className="failed">{error}</p> : !found ? <p className="failed">No repository view “{view}”.</p> : repo ? <found.Body worktree={repo.worktree} repoDir={repo.repoDir} name={repo.name} /> : <p className="empty">Loading…</p>}</div>
  </div>;
}
