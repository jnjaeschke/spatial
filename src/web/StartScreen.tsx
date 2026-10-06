import { useEffect, useState } from "react";
import type { RepoInfo } from "../shared/types.ts";
import { api } from "./api.ts";
import { SessionList } from "./SessionPicker.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";

export function StartScreen({ path }: { path: string }) {
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
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
    <form className="new-session" onSubmit={(e) => {
      e.preventDefault();
      api.createSession(repo.worktree, title || "Review").then((s) => { location.search = `?session=${encodeURIComponent(s.id)}`; }, (err: Error) => setError(err.message));
    }}>
      <input aria-label="title" placeholder="title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <button type="submit">New review session</button>
    </form>
    {error && <p className="failed">{error}</p>}
    <SessionList sessions={repo.sessions} />
  </div>;
}
