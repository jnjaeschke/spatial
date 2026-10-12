import { useState } from "react";
import type { RefRow } from "../../../web/plugin-api.ts";
import { groupRefs } from "../shared/refs.ts";

const basename = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;

/** Refs grouped like the branch list: local branches with remote and work tree chips, remote-only branches, and tags behind an expander with a filter (a repository may have thousands). Clicking a ref jumps to its commit. */
export function RefsSidebar({ refs, worktree, onJump }: { refs: RefRow[]; worktree: string; onJump(name: string): void }) {
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagFilter, setTagFilter] = useState("");
  const { local, remoteOnly, tags } = groupRefs(refs);
  const filteredTags = tags.filter((tag) => tag.name.includes(tagFilter));
  const shownTags = filteredTags.slice(0, 200);
  return <nav className="scm-sidebar" aria-label="Refs">
    <h4>Local <span className="count">{local.length}</span></h4>
    <ul>{local.map((ref) => <li key={ref.name}><button type="button" className="link-button" onClick={() => onJump(ref.name)}>{ref.name}{ref.remotes.map((remote) => <span key={remote} className="ref-chip" title={remote}>{remote.slice(0, remote.indexOf("/"))}</span>)}{ref.worktree && <span className={`ref-chip worktree${ref.worktree === worktree ? " current" : ""}`} title={ref.worktree}>⌂ {basename(ref.worktree)}</span>}</button></li>)}</ul>
    <h4>Remote only <span className="count">{remoteOnly.length}</span></h4>
    <ul>{remoteOnly.map((ref) => <li key={ref.name}><button type="button" className="link-button" onClick={() => onJump(ref.name)}>{ref.name}</button></li>)}</ul>
    <details onToggle={(event) => setTagsOpen(event.currentTarget.open)}><summary>Tags <span className="count">{tags.length}</span></summary>
      {tagsOpen && <><input type="search" aria-label="Filter tags" placeholder="Filter" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} />
        <ul>{shownTags.map((ref) => <li key={ref.name}><button type="button" className="link-button" onClick={() => onJump(ref.name)}>{ref.name}</button></li>)}</ul>
        {shownTags.length < filteredTags.length && <p className="count">Showing 200; filter to narrow.</p>}</>}
    </details>
  </nav>;
}
