import { useEffect, useState, type ReactNode } from "react";
import { ErrorText, getJson, repoName, type PhaseViewProps, type RefRow, type RepoViewProps } from "../../../web/plugin-api.ts";
import { groupRefs } from "../shared/refs.ts";

const basename = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;

function RefTable({ label, rows, chips }: { label: string; rows: RefRow[]; chips?: (ref: RefRow) => ReactNode }) {
  return <table className="scm-refs" aria-label={label}><thead><tr><th>Name</th><th>Commit</th><th>Date</th></tr></thead><tbody>
    {rows.map((ref) => <tr key={`${ref.kind}:${ref.name}`}><td>{ref.name}{chips?.(ref)}</td><td><code>{ref.sha.slice(0, 12)}</code></td><td title={ref.date}>{ref.date.slice(0, 10)}</td></tr>)}
  </tbody></table>;
}

/** The repository's refs: local branches with their remote counterparts and work trees, remote-only branches, and tags (collapsed: a repository may have thousands). */
export function ScmView({ worktree }: RepoViewProps) {
  const [data, setData] = useState<{ refs: RefRow[]; commitGraph: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    getJson<{ refs: RefRow[]; commitGraph: boolean }>(`/api/scm/refs?repo=${encodeURIComponent(worktree)}`).then((value) => { if (!cancelled) setData(value); }, (e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [worktree]);
  if (error) return <ErrorText error={error} />;
  if (!data) return <p className="empty">Loading…</p>;
  const { local, remoteOnly, tags } = groupRefs(data.refs);
  const remotesOf = new Map(local.map((ref) => [ref.name, ref.remotes]));
  return <div className="scm-view" data-testid="scm-view">
    {!data.commitGraph && <p className="commit-graph-warning">This repository has no commit-graph file, so history loads slowly. Run <code>git commit-graph write --reachable</code>.</p>}
    <h3>Local branches <span className="count">{local.length}</span></h3>
    <RefTable label="Local branches" rows={local} chips={(ref) => <>
      {remotesOf.get(ref.name)!.map((remote) => <span key={remote} className="ref-chip" title={remote}>{remote.slice(0, remote.indexOf("/"))}</span>)}
      {ref.worktree && <span className={`ref-chip worktree${ref.worktree === worktree ? " current" : ""}`} title={ref.worktree}>⌂ {basename(ref.worktree)}</span>}
    </>} />
    <h3>Remote only <span className="count">{remoteOnly.length}</span></h3>
    <RefTable label="Remote only" rows={remoteOnly} />
    <details onToggle={(event) => setTagsOpen(event.currentTarget.open)}><summary>Tags <span className="count">{tags.length}</span></summary>{tagsOpen && <RefTable label="Tags" rows={tags} />}</details>
  </div>;
}

/** The Git view inside a session: the session's work tree. */
export function ScmSessionView({ state }: PhaseViewProps) {
  return <ScmView worktree={state.session.worktree} repoDir={state.session.repoDir} name={repoName(state.session.repoDir)} />;
}
