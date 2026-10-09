import { useContext, useEffect } from "react";
import type { DiffFile, Hunk } from "../shared/types.ts";
import { FileViewContext } from "./plugin-api.ts";
import { findInHunks } from "./inline-code.ts";
import { SearchfoxContext } from "./searchfox-url.ts";

export function CodeSpan({ text, hunks, diffId }: { text: string; hunks?: { file: DiffFile; hunk: Hunk }[]; diffId?: string }) {
  const sf = useContext(SearchfoxContext);
  const open = useContext(FileViewContext);
  const match = open && hunks && diffId ? findInHunks(text, hunks) : null;
  useEffect(() => {
    if (sf?.exact && sf.links[text] === undefined) sf.request(text);
  }, [sf, text]);
  if (match && open && diffId) {
    const openFile = open;
    return <button className="link-button code-link" title="Show in diff" onClick={() => openFile({ diffId, path: match.path, hunkId: match.hunkId, text: match.text, row: { side: match.side, line: match.line } })}>{text}</button>;
  }
  if (!sf?.exact) return <code>{text}</code>;
  const url = sf.links[text];
  return typeof url === "string"
    ? <a className="link-button code-link nodrag" href={url} target="_blank" rel="noreferrer" title="Searchfox at the patch's merge-base"><code>{text}</code></a>
    : <code>{text}</code>;
}
