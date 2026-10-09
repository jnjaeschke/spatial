import { useEffect, useRef, useState } from "react";
import type { DirectoryListing, RecentRepo } from "../shared/types.ts";
import { api } from "./api.ts";

const RECENT_LIMIT = 6;

export function FolderPicker({ onClose }: { onClose: () => void }) {
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [selected, setSelected] = useState(0);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [canOpen, setCanOpen] = useState(false);
  const [recents, setRecents] = useState<RecentRepo[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  // Listings can resolve out of order (the initial home listing after a typed path); only the latest request counts.
  const request = useRef(0);
  // Typing in the path field while a listing loads must not be overwritten by that listing's path.
  const edits = useRef(0);
  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    void navigate();
    api.repos().then((repos) => setRecents(repos.toSorted((a, b) => b.lastActive.localeCompare(a.lastActive)).slice(0, RECENT_LIMIT)), () => setRecents([]));
  }, []);

  async function navigate(path?: string) {
    const id = ++request.current, editsAtStart = edits.current;
    setError(null);
    try {
      const value = await api.dirs(path);
      if (id !== request.current) return;
      setListing(value);
      if (edits.current === editsAtStart) setInput(value.path);
      setSelected(0);
      setCanOpen(false);
      const open = await api.repo(value.path).then(() => true, () => false);
      if (id === request.current) setCanOpen(open);
    } catch (e) {
      if (id !== request.current) return;
      setError((e as Error).message);
      setCanOpen(false);
    }
  }
  const items = listing?.entries ?? [];
  const choices = [...(listing?.parent ? [{ name: "..", path: listing.parent, repo: false }] : []), ...items];
  // The selected repository entry, else the listed directory when it is inside a work tree.
  const target = choices[selected]?.repo ? choices[selected]!.path : canOpen && listing ? listing.path : null;
  function goSelected() {
    const item = choices[selected];
    if (item) void navigate(item.path);
  }
  function keyDown(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
    else if (event.key === "ArrowDown" && choices.length) { event.preventDefault(); setSelected((selected + 1) % choices.length); }
    else if (event.key === "ArrowUp" && choices.length) { event.preventDefault(); setSelected((selected + choices.length - 1) % choices.length); }
    else if (event.target instanceof HTMLElement && !event.target.matches("input, button[type=submit]")) {
      if (event.key === "Backspace" && listing?.parent) { event.preventDefault(); void navigate(listing.parent); }
      else if (event.key === "Enter" && (event.target === dialog.current || event.target.closest(".folder-entries"))) { event.preventDefault(); goSelected(); }
    }
  }
  return <dialog ref={dialog} className="folder-picker" aria-label="Open folder" onKeyDown={keyDown} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><h2>Open folder</h2><button type="button" aria-label="Close" onClick={onClose}>×</button></header>
    {recents.length > 0 && <nav aria-label="Recent folders" className="folder-recents"><h3>Recent</h3><ul>{recents.map((repo) => <li key={repo.worktree}>
      <a href={`?path=${encodeURIComponent(repo.worktree)}`}><b>{repo.name}</b> <code>{repo.worktree}</code></a>
    </li>)}</ul></nav>}
    {listing && <nav aria-label="Folder breadcrumbs" className="folder-breadcrumbs">{listing.path.split(/[\\/]/).filter(Boolean).map((part, index, parts) => {
      const root = listing.path.startsWith("/") ? "/" : "";
      const path = root + parts.slice(0, index + 1).join(listing.path.includes("\\") ? "\\" : "/");
      return <button type="button" key={path} onClick={() => void navigate(path)}>{part}</button>;
    })}</nav>}
    <form onSubmit={(event) => { event.preventDefault(); void navigate(input); }}><label>Path <input aria-label="Path" value={input} onChange={(event) => { edits.current++; setInput(event.target.value); }} /></label><button type="submit">Go</button></form>
    <ul className="folder-entries">{choices.map((item, index) => <li key={item.path}><button type="button" aria-current={index === selected ? "true" : undefined} onFocus={() => setSelected(index)} onDoubleClick={() => void navigate(item.path)} onClick={() => setSelected(index)}><span>{item.name}{item.repo ? " · repository" : ""}</span></button></li>)}</ul>
    {listing?.truncated && <p>Showing the first 2000 directories.</p>}
    {error && <p className="failed" role="alert">{error}</p>}
    <footer><button type="button" onClick={onClose}>Cancel</button><button type="button" disabled={!target} onClick={() => { if (target) window.location.href = `?path=${encodeURIComponent(target)}`; }}>Open</button></footer>
  </dialog>;
}
