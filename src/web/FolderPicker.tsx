import { useEffect, useRef, useState } from "react";
import type { DirectoryListing, RecentRepo } from "../shared/types.ts";
import { api } from "./api.ts";
import { ErrorText, useAction } from "./action.tsx";
import { Dialog } from "./Dialog.tsx";

const RECENT_LIMIT = 6;

export function FolderPicker({ onClose }: { onClose: () => void }) {
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [selected, setSelected] = useState(0);
  const [input, setInput] = useState("");
  const { error, fail, clear } = useAction();
  const [canOpen, setCanOpen] = useState(false);
  // null while loading: the listing waits for it, so the recent folders do not push it down under the pointer.
  const [recents, setRecents] = useState<RecentRepo[] | null>(null);
  // Listings can resolve out of order (the initial home listing after a typed path); only the latest request counts.
  const request = useRef(0);
  // Typing in the path field while a listing loads must not be overwritten by that listing's path.
  const edits = useRef(0);
  useEffect(() => {
    void navigate();
    api.repos().then((repos) => setRecents(repos.toSorted((a, b) => b.lastActive.localeCompare(a.lastActive)).slice(0, RECENT_LIMIT)), () => setRecents([]));
  }, []);

  async function navigate(path?: string) {
    const id = ++request.current, editsAtStart = edits.current;
    clear();
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
      fail((e as Error).message);
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
  function keyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown" && choices.length) { event.preventDefault(); setSelected((selected + 1) % choices.length); }
    else if (event.key === "ArrowUp" && choices.length) { event.preventDefault(); setSelected((selected + choices.length - 1) % choices.length); }
    else if (event.target instanceof HTMLElement && !event.target.matches("input, button[type=submit]")) {
      if (event.key === "Backspace" && listing?.parent) { event.preventDefault(); void navigate(listing.parent); }
      else if (event.key === "Enter" && (event.target === event.currentTarget || event.target.closest(".folder-entries"))) { event.preventDefault(); goSelected(); }
    }
  }
  return <Dialog title="Open folder" onClose={onClose} className="folder-picker" footer={<><button type="button" onClick={onClose}>Cancel</button><button type="button" disabled={!target} onClick={() => { if (target) window.location.href = `?path=${encodeURIComponent(target)}`; }}>Open</button></>}>
    <div onKeyDown={keyDown}>
    {recents && recents.length > 0 && <nav aria-label="Recent folders" className="folder-recents"><h3>Recent</h3><ul>{recents.map((repo) => <li key={repo.worktree}>
      <a href={`?path=${encodeURIComponent(repo.worktree)}`}><b>{repo.name}</b> <code>{repo.worktree}</code></a>
    </li>)}</ul></nav>}
    {recents && listing && <nav aria-label="Folder breadcrumbs" className="folder-breadcrumbs">{listing.path.split(/[\\/]/).filter(Boolean).map((part, index, parts) => {
      const root = listing.path.startsWith("/") ? "/" : "";
      const path = root + parts.slice(0, index + 1).join(listing.path.includes("\\") ? "\\" : "/");
      return <button type="button" key={path} onClick={() => void navigate(path)}>{part}</button>;
    })}</nav>}
    {recents && <form onSubmit={(event) => { event.preventDefault(); void navigate(input); }}><label>Path <input aria-label="Path" value={input} onChange={(event) => { edits.current++; setInput(event.target.value); }} /></label><button type="submit">Go</button></form>}
    {recents && <ul className="folder-entries">{choices.map((item, index) => <li key={item.path}><button type="button" aria-current={index === selected ? "true" : undefined} onFocus={() => setSelected(index)} onDoubleClick={() => void navigate(item.path)} onClick={() => setSelected(index)}><span>{item.name}{item.repo ? " · repository" : ""}</span></button></li>)}</ul>}
    {listing?.truncated && <p>Showing the first 2000 directories.</p>}
    <ErrorText error={error} />
    </div>
  </Dialog>;
}
