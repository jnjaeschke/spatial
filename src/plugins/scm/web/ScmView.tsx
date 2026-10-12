import { useEffect, useState } from "react";
import { ErrorText, getJson, repoName, type PhaseViewProps, type RefRow, type RepoViewProps } from "../../../web/plugin-api.ts";

/** The repository's refs: branches with the work tree they are checked out in, remote branches, tags and HEAD. */
export function ScmView({ worktree }: RepoViewProps) {
  const [data, setData] = useState<{ refs: RefRow[]; commitGraph: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    getJson<{ refs: RefRow[]; commitGraph: boolean }>(`/api/scm/refs?repo=${encodeURIComponent(worktree)}`).then((value) => { if (!cancelled) setData(value); }, (e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [worktree]);
  if (error) return <ErrorText error={error} />;
  if (!data) return <p className="empty">Loading…</p>;
  return <div className="scm-view" data-testid="scm-view">
    {!data.commitGraph && <p className="commit-graph-warning">This repository has no commit-graph file, so history loads slowly. Run <code>git commit-graph write --reachable</code>.</p>}
    <table className="scm-refs"><thead><tr><th>Ref</th><th>Kind</th><th>Commit</th><th>Work tree</th></tr></thead><tbody>
      {data.refs.map((ref) => <tr key={`${ref.kind}:${ref.name}`}><td>{ref.name}{ref.upstream && <span className="upstream"> → {ref.upstream}</span>}</td><td>{ref.kind}</td><td><code>{ref.sha.slice(0, 12)}</code></td><td>{ref.worktree && <code>{ref.worktree}</code>}</td></tr>)}
    </tbody></table>
  </div>;
}

/** The Git view inside a session: the session's work tree. */
export function ScmSessionView({ state }: PhaseViewProps) {
  return <ScmView worktree={state.session.worktree} repoDir={state.session.repoDir} name={repoName(state.session.repoDir)} />;
}
