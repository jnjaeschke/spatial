import { useContext } from "react";
import type { DiffFile, Hunk } from "../shared/types.ts";
import { FileViewContext } from "./plugin-api.ts";
import { findInHunks } from "./inline-code.ts";
import { CodeLinksContext, useCodeLinkUrl } from "./code-links.ts";

export function CodeSpan({ text, hunks, diffId }: { text: string; hunks?: { file: DiffFile; hunk: Hunk }[]; diffId?: string }) {
  const open = useContext(FileViewContext);
  const url = useCodeLinkUrl(text);
  const title = useContext(CodeLinksContext)?.title;
  const match = open && hunks && diffId ? findInHunks(text, hunks) : null;
  if (match && open && diffId) {
    const openFile = open;
    return <button className="link-button code-link" title="Show in diff" onClick={() => openFile({ diffId, path: match.path, hunkId: match.hunkId, text: match.text, row: { side: match.side, line: match.line } })}>{text}</button>;
  }
  return url
    ? <a className="link-button code-link nodrag" href={url} target="_blank" rel="noreferrer" title={title}><code>{text}</code></a>
    : <code>{text}</code>;
}
