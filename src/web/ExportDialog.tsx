import { useEffect, useState } from "react";
import type { Artifact, PostedCommentData, SessionState } from "../shared/types.ts";
import type { ExportDiff } from "./plugin-api.ts";
import { exportHtml, exportState, type SessionExport } from "./export-state.ts";
import { loadFileLines } from "./file-lines.ts";
import { ErrorText, useAction } from "./action.tsx";
import { Dialog } from "./Dialog.tsx";

const FILE_CAP = 1_000_000;
const VIEW_KEYS = ["collapse", "free", "sizes", "view"];

async function bundleText(): Promise<{ css: string; js: string }> {
  const scripts = [...document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')];
  const styles = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')];
  if (scripts.length !== 1 || styles.length !== 1) throw new Error("Export needs the built UI (npm run build:web)");
  const text = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url}: HTTP ${response.status}`);
    return response.text();
  };
  const [js, css] = await Promise.all([text(scripts[0]!.src), text(styles[0]!.href)]);
  return { css, js };
}

async function prepare(state: SessionState, diff: ExportDiff | null): Promise<{ data: SessionExport; css: string; js: string }> {
  const sessionId = state.session.id;
  const closed = new Set(JSON.parse(localStorage.getItem(`spatial-ide:closed:${sessionId}`) ?? "[]") as string[]);
  const files: Record<string, string[] | null> = {};
  if (diff) await Promise.all(diff.files.map(async (path) => {
    const lines = await loadFileLines(sessionId, diff.id, path);
    files[path] = lines.reduce((size, line) => size + line.length + 1, 0) > FILE_CAP ? null : lines;
  }));
  const view: Record<string, string> = {};
  for (const kind of VIEW_KEYS) {
    const key = `spatial-ide:${kind}:${sessionId}`;
    const value = localStorage.getItem(key);
    if (value !== null) view[key] = value;
  }
  const { css, js } = await bundleText();
  return { data: { version: 1, exportedAt: new Date().toISOString(), state: exportState(state, closed, diff?.commits ?? []), diffId: diff?.id ?? null, files, view }, css, js };
}

function contents(data: SessionExport): string[] {
  const count = (type: string) => data.state.artifacts.filter((a) => a.type === type).length;
  const posted = new Set((data.state.artifacts.filter((a) => a.type === "PostedComment") as Artifact<PostedCommentData>[]).map((a) => a.data.comment));
  const drafts = data.state.artifacts.filter((a) => a.type === "ReviewComment" && !posted.has(a.id)).length;
  const omitted = Object.entries(data.files).filter(([, lines]) => lines === null).map(([path]) => path);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return [
    `${plural(count("ChatThread"), "chat")}, ${plural(count("Note"), "note")}, ${plural(count("Diagram"), "diagram")} (closed ones are left out)`,
    `${plural(count("ReviewFinding"), "finding")}, ${plural(drafts, "unposted draft comment")}`,
    `${plural(Object.keys(data.files).length - omitted.length, "full file")} for expanding context${omitted.length ? `; too large, left out: ${omitted.join(", ")}` : ""}`,
    "Your current layout, collapsed cards and viewport",
  ];
}

/** Prepares a read-only static copy of the session, lists what it contains, and saves it as one HTML file. */
export function ExportDialog({ state, diff, onClose }: { state: SessionState; diff: ExportDiff | null; onClose: () => void }) {
  const [prepared, setPrepared] = useState<Awaited<ReturnType<typeof prepare>> | null>(null);
  const { error, fail } = useAction();
  useEffect(() => {
    let cancelled = false;
    prepare(state, diff).then((value) => { if (!cancelled) setPrepared(value); }, (e: Error) => { if (!cancelled) fail(e.message); });
    return () => { cancelled = true; };
  }, [state]);
  const save = () => {
    const url = URL.createObjectURL(new Blob([exportHtml(state.session.title, prepared!.css, prepared!.js, prepared!.data)], { type: "text/html" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.session.title.replace(/[^\w.-]+/g, "-")}.spatial.html`;
    link.click();
    // Revoking right away can cancel the download before it reads the blob.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    onClose();
  };
  return <Dialog title="Export read-only copy" onClose={onClose} footer={<><button type="button" onClick={onClose}>Cancel</button><button type="button" disabled={!prepared} onClick={save}>Save file</button></>}>
    {error ? <ErrorText error={error} /> : prepared ? <>
      <p>One HTML file that opens offline. Anyone with the file sees:</p>
      <ul>{contents(prepared.data).map((line) => <li key={line}>{line}</li>)}</ul>
    </> : <p>Preparing…</p>}
  </Dialog>;
}
