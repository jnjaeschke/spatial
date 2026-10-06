import { useEffect, useState } from "react";
import type { Session } from "../shared/types.ts";
import { groupByRepo } from "../shared/repos.ts";
import { api } from "./api.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { TextSizeControl } from "./TextSizeControl.tsx";

/** Session links with their worktree, in the given order. */
export function SessionList({ sessions }: { sessions: Session[] }) {
  return <ul className="session-list">{sessions.map((s) => <li key={s.id}><a href={`?session=${encodeURIComponent(s.id)}`}>{s.title}</a> <span className="badge">{s.workflow ?? "starting"}</span> <code>{s.worktree}</code> <time dateTime={s.createdAt}>{new Date(s.createdAt).toLocaleString()}</time></li>)}</ul>;
}

export function SessionPicker() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.sessions().then(setSessions, (e: Error) => setError(e.message)); }, []);
  return <div className="empty session-picker">
    <header><h2>Sessions</h2><TextSizeControl /><ThemeToggle /></header>
    {sessions && groupByRepo(sessions).map((group) => <section className="repo-group" data-testid="repo-group" key={group.repoDir}>
      <h3><a href={`?path=${encodeURIComponent(group.sessions[0]!.worktree)}`}>{group.name}</a></h3>
      <code>{group.repoDir}</code>
      <SessionList sessions={group.sessions} />
    </section>)}
    {error && <p className="failed">{error}</p>}
  </div>;
}
