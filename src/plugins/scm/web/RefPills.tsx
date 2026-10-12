import type { RefRow } from "../../../web/plugin-api.ts";

const ORDER: Record<RefRow["kind"], number> = { HEAD: 0, head: 1, remote: 2, tag: 3 };
const basename = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;

/** The refs pointing at one commit: HEAD, local branches (with the work tree they are checked out in), remote branches, tags; more than three collapse into "+N". */
export function RefPills({ refs, worktree }: { refs: RefRow[]; worktree: string }) {
  if (!refs.length) return null;
  const sorted = [...refs].sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.name.localeCompare(b.name));
  const pill = (ref: RefRow) => <span key={`${ref.kind}:${ref.name}`} data-ref={`${ref.kind}:${ref.name}`} className={`ref-pill ref-${ref.kind === "HEAD" ? "current-head" : ref.kind}${ref.worktree === worktree ? " current" : ""}`} title={ref.worktree ? `${ref.name}, checked out in ${ref.worktree}` : ref.name}>{ref.name}{ref.worktree && ref.worktree !== worktree && <span className="ref-worktree"> ⌂ {basename(ref.worktree)}</span>}</span>;
  return <span className="ref-pills">{sorted.length > 3 ? <>{sorted.slice(0, 2).map(pill)}<span className="ref-pill more" title={sorted.slice(2).map((ref) => ref.name).join(", ")}>+{sorted.length - 2}</span></> : sorted.map(pill)}</span>;
}
