import { useEffect, useState } from "react";
import type { RecentRepo, SessionListing } from "../shared/types.ts";
import { groupByRepo } from "../shared/repos.ts";
import { api } from "./api.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { UsageWidget } from "./UsageWidget.tsx";
import { TextSizeControl } from "./TextSizeControl.tsx";
import { FolderPicker } from "./FolderPicker.tsx";
import { routeUrl } from "./routes.ts";
import { Dialog } from "./Dialog.tsx";
import { IconButton } from "./IconButton.tsx";
import { ErrorText, useAction } from "./action.tsx";

/** Session links with their worktree and last activity, in the given order; each can be deleted after a confirmation. */
export function SessionList({ sessions }: { sessions: SessionListing[] }) {
  const [deleted, setDeleted] = useState<ReadonlySet<string>>(new Set());
  const [deleting, setDeleting] = useState<SessionListing | null>(null);
  return <>
    <ul className="session-list">{sessions.filter((s) => !deleted.has(s.id)).map((s) => <li key={s.id}>
      <a href={routeUrl({ kind: "session", sessionId: s.id, place: null })}>{s.title}</a> <span className="badge">{s.workflow ?? "starting"}</span> <code>{s.worktree}</code> <time dateTime={s.lastActive} title={`Created ${new Date(s.createdAt).toLocaleString()}`}>{new Date(s.lastActive).toLocaleString()}</time>
      <IconButton label={`Delete session ${s.title}`} className="delete-session" onClick={() => setDeleting(s)}>×</IconButton>
    </li>)}</ul>
    {deleting && <DeleteSessionDialog session={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleted((ids) => new Set(ids).add(deleting.id)); setDeleting(null); }} />}
  </>;
}

function DeleteSessionDialog({ session, onClose, onDeleted }: { session: SessionListing; onClose(): void; onDeleted(): void }) {
  const { busy, error, run } = useAction();
  return <Dialog title="Delete session?" testId="delete-session-dialog" onClose={onClose} footer={<>
    <button type="button" onClick={onClose}>Cancel</button>
    <button type="button" className="danger" disabled={busy} onClick={() => void run(async () => { await api.deleteSession(session.id); onDeleted(); })}>Delete</button>
  </>}>
    <p><b>{session.title}</b> and everything in it (chats, notes, findings and the work history) are deleted. Branches and commits in <code>{session.worktree}</code> stay.</p>
    <ErrorText error={error} />
  </Dialog>;
}

export function SessionPicker() {
  const [sessions, setSessions] = useState<SessionListing[] | null>(null);
  const [repos, setRepos] = useState<RecentRepo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => { document.title = "spatial"; }, []);
  useEffect(() => { api.sessions().then(setSessions, (e: Error) => setError(e.message)); api.repos().then(setRepos, (e: Error) => setError(e.message)); }, []);
  return <div className="empty session-picker">
    <header><h2>Recent repositories</h2><button type="button" onClick={() => setPickerOpen(true)}>Open folder…</button><UsageWidget /><TextSizeControl /><ThemeToggle /></header>
    {sessions && repos && <>{repos.map((repo) => <section className="recent-repo" data-testid="recent-repo" key={repo.worktree}>
      <a href={routeUrl({ kind: "repo", path: repo.worktree })}>{repo.name}</a> <code>{repo.worktree}</code>
    </section>)}
    <h2 className="session-picker-heading">Sessions</h2>
    {groupByRepo(sessions).map((group) => <section className="repo-group" data-testid="repo-group" key={group.repoDir}>
      <h3><a href={routeUrl({ kind: "repo", path: group.sessions[0]!.worktree })}>{group.name}</a></h3>
      <code>{group.repoDir}</code>
      <SessionList sessions={group.sessions} />
    </section>)}</>}
    {error && <p className="failed">{error}</p>}
    {pickerOpen && <FolderPicker onClose={() => setPickerOpen(false)} />}
  </div>;
}
