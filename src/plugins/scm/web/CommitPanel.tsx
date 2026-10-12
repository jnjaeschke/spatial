import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ErrorText, FileDiff, getJson, postJson, routeUrl, SidePanel, type CommitDetail, type CommitFileStat, type DiffFile, type Session, type StartQuestion } from "../../../web/plugin-api.ts";
import type { PanelProps } from "./GraphView.tsx";

/** A commit with more files than this, or a file with more changed lines, starts with its diffs collapsed. */
const AUTO_FILES = 30;
const AUTO_LINES = 2000;

type Target = { kind: "commit"; sha: string } | { kind: "range"; from: string; to: string };
interface Loaded { detail: CommitDetail | null; files: CommitFileStat[]; base: string | null; head: string }

function FileSection({ worktree, base, head, file, index, startOpen }: { worktree: string; base: string | null; head: string; file: CommitFileStat; index: number; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [diff, setDiff] = useState<DiffFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open || diff || file.binary) return;
    const query = new URLSearchParams({ repo: worktree, b: head });
    if (base !== null) query.set("a", base);
    if (file.oldPath) query.append("path", file.oldPath);
    query.append("path", file.path);
    let cancelled = false;
    getJson<DiffFile[]>(`/api/scm/diff?${query}`).then((files) => { if (!cancelled) setDiff(files[0] ?? null); }, (e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [open, diff, file, worktree, base, head]);
  const loadLines = () => getJson<{ lines: string[] }>(`/api/scm/file?${new URLSearchParams({ repo: worktree, rev: head, path: file.path })}`).then((body) => body.lines);
  return <section className="commit-file" id={`commit-file-${index}`}>
    <h4><button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "▾" : "▸"}</button> {file.oldPath ? `${file.oldPath} → ${file.path}` : file.path} <span className="count">{file.binary ? "binary" : `+${file.added} −${file.deleted}`}</span></h4>
    {open && (file.binary ? <p className="file-diff-binary">Binary file</p> : error ? <ErrorText error={error} /> : diff ? <FileDiff file={diff} loadLines={file.status === "modified" || file.status === "renamed" ? loadLines : undefined} /> : <p className="count">Loading…</p>)}
  </section>;
}

/** The selected commit, or the range between two compared commits (older to newer by graph order). */
export function CommitPanel({ worktree, selected, compare, order, select, close }: PanelProps & { worktree: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const change = useRef(-1);
  const target: Target | null = !selected ? null : compare ? (() => {
    // Rows further down the graph are older; an unloaded commit counts as oldest.
    const [a, b] = [selected, compare].sort((x, y) => (order.get(y) ?? Infinity) - (order.get(x) ?? Infinity));
    return { kind: "range", from: a!, to: b! } as const;
  })() : { kind: "commit", sha: selected };
  const key = target ? (target.kind === "commit" ? target.sha : `${target.from}..${target.to}`) : null;
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setLoaded(null);
    setError(null);
    setReviewError(null);
    change.current = -1;
    const load = target.kind === "commit"
      ? getJson<CommitDetail>(`/api/scm/commit?${new URLSearchParams({ repo: worktree, rev: target.sha })}`).then((detail): Loaded => ({ detail, files: detail.files, base: detail.parents[0] ?? null, head: detail.sha }))
      : getJson<CommitFileStat[]>(`/api/scm/files?${new URLSearchParams({ repo: worktree, a: target.from, b: target.to })}`).then((files): Loaded => ({ detail: null, files, base: target.from, head: target.to }));
    load.then((value) => { if (!cancelled) setLoaded(value); }, (e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
    // `key` identifies the target; `target` is rebuilt every render.
  }, [key, worktree]);
  if (!target) return null;

  const review = async () => {
    if (!loaded || loaded.base === null) return;
    setReviewError(null);
    try {
      const result = await postJson<Session | StartQuestion>("/api/start", { path: worktree, text: `/review ${loaded.base}..${loaded.head}` });
      if ("question" in result) setReviewError(result.question);
      else navigation.navigate(routeUrl({ kind: "session", sessionId: result.id, place: null }));
    } catch (e) {
      setReviewError((e as Error).message);
    }
  };
  const step = (delta: number) => {
    if (!body.current) return;
    const changed = [...body.current.querySelectorAll<HTMLElement>("tr.add, tr.del")];
    const starts = changed.filter((row) => { const previous = row.previousElementSibling; return !previous || !(previous.classList.contains("add") || previous.classList.contains("del")); });
    const next = change.current + delta;
    if (next < 0 || next >= starts.length) return;
    change.current = next;
    for (const row of body.current.querySelectorAll("tr.focus")) row.classList.remove("focus");
    let row: Element | null = starts[next]!;
    while (row && (row.classList.contains("add") || row.classList.contains("del"))) { row.classList.add("focus"); row = row.nextElementSibling; }
    starts[next]!.scrollIntoView({ block: "center" });
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || (event.key !== "n" && event.key !== "p")) return;
    event.preventDefault();
    step(event.key === "n" ? 1 : -1);
  };
  const title = target.kind === "commit" ? (loaded?.detail?.subject ?? target.sha.slice(0, 12)) : `Compare ${target.from.slice(0, 10)}..${target.to.slice(0, 10)}`;
  const autoOpen = (file: CommitFileStat) => (loaded?.files.length ?? 0) <= AUTO_FILES && file.added + file.deleted <= AUTO_LINES;
  return <SidePanel className="commit-panel" title={title} closeLabel="Close commit" onClose={close} testId="commit-panel" onKeyDown={onKeyDown} bodyRef={body}>
    <div data-testid="commit-panel-body" tabIndex={-1} className="commit-panel-content">
      {error && <ErrorText error={error} />}
      {!loaded && !error && <p className="count">Loading…</p>}
      {loaded && <>
        {loaded.detail && <div className="commit-meta">
          {loaded.detail.body && <pre className="commit-body">{loaded.detail.body}</pre>}
          <p><b>{loaded.detail.author}</b> &lt;{loaded.detail.email}&gt; · {new Date(loaded.detail.date).toLocaleString()}</p>
          {(loaded.detail.committer !== loaded.detail.author || loaded.detail.committerDate !== loaded.detail.date) && <p className="count">Committed by {loaded.detail.committer} · {new Date(loaded.detail.committerDate).toLocaleString()}</p>}
          <p><code>{loaded.detail.sha}</code> {loaded.detail.parents.length > 0 && <>· parent{loaded.detail.parents.length > 1 ? "s" : ""} {loaded.detail.parents.map((parent) => <button key={parent} type="button" className="link-button" onClick={() => select(parent)}><code>{parent.slice(0, 10)}</code></button>)}</>}</p>
        </div>}
        <div className="commit-actions">
          <button type="button" onClick={() => void navigator.clipboard.writeText(loaded.head)}>Copy sha</button>
          {loaded.base !== null && <button type="button" onClick={() => void review()}>Review this</button>}
          {reviewError && <ErrorText error={reviewError} />}
        </div>
        <ul className="commit-files">{loaded.files.map((file, index) => <li key={file.path}><button type="button" className="link-button" onClick={() => document.getElementById(`commit-file-${index}`)?.scrollIntoView({ block: "start" })}>{file.path}</button> <span className="count">{file.binary ? "binary" : `+${file.added} −${file.deleted}`}</span></li>)}</ul>
        {loaded.files.map((file, index) => <FileSection key={`${key}:${file.path}`} worktree={worktree} base={loaded.base} head={loaded.head} file={file} index={index} startOpen={autoOpen(file)} />)}
      </>}
    </div>
  </SidePanel>;
}
