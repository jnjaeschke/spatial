import { useEffect, useState } from "react";
import type { Session } from "../shared/types.ts";
import { api } from "./api.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";

const open = (id: string) => { location.search = `?session=${encodeURIComponent(id)}`; };

export function SessionPicker() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [repo, setRepo] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.sessions().then(setSessions, (e: Error) => setError(e.message)); }, []);
  return <div className="empty session-picker">
    <header><h2>Sessions</h2><ThemeToggle /></header>
    <ul className="session-list">{sessions?.map((s) => <li key={s.id}><a href={`?session=${s.id}`}>{s.title}</a> <code>{s.repo}</code></li>)}</ul>
    <form className="new-session" onSubmit={(e) => {
      e.preventDefault();
      api.createSession(repo, title || repo).then((s) => open(s.id), (err: Error) => setError(err.message));
    }}>
      <input aria-label="repo" placeholder="/path/to/repo" value={repo} onChange={(e) => setRepo(e.target.value)} size={40} />
      <input aria-label="title" placeholder="title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <button type="submit">New session</button>
    </form>
    {error && <p className="failed">{error}</p>}
  </div>;
}
