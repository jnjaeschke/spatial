import { useContext } from "react";
import type { DiffFile, Hunk } from "../shared/types.ts";
import { FileViewContext } from "./plugin-api.ts";
import { findInHunks } from "./inline-code.ts";
import { SearchfoxContext, searchUrl } from "./searchfox-url.ts";

export function CodeSpan({ text, hunks, diffId }: { text: string; hunks?: { file: DiffFile; hunk: Hunk }[]; diffId?: string }) {
  const sf = useContext(SearchfoxContext);
  const open = useContext(FileViewContext);
  const match = open && hunks && diffId ? findInHunks(text, hunks) : null;
  if (match && open && diffId) {
    const openFile = open;
    return <button className="code-link" title="Show in diff" onClick={() => openFile({ diffId, path: match.path, hunkId: match.hunkId, text: match.text, row: { side: match.side, line: match.line } })}>{text}</button>;
  }
  return sf
    ? <a className="code-link nodrag" href={searchUrl(sf, text)} target="_blank" rel="noreferrer" title="Search on Searchfox"><code>{text}</code></a>
    : <code>{text}</code>;
}
