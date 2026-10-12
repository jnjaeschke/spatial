import { useContext, useEffect } from "react";
import type { DiffFile, Hunk } from "../shared/types.ts";
import { FileViewContext } from "./plugin-api.ts";
import { findInHunks } from "./inline-code.ts";
import { SearchfoxContext } from "./searchfox-url.ts";

/** The Searchfox URL of a code token, requesting it when it is unresolved; null while pending, when it has no link, and for a null token. */
export function useSearchfoxUrl(token: string | null): string | null {
  const sf = useContext(SearchfoxContext);
  useEffect(() => {
    if (token !== null && sf?.exact && sf.links[token] === undefined) sf.request(token);
  }, [sf, token]);
  const url = token !== null && sf?.exact ? sf.links[token] : null;
  return typeof url === "string" ? url : null;
}

export function CodeSpan({ text, hunks, diffId }: { text: string; hunks?: { file: DiffFile; hunk: Hunk }[]; diffId?: string }) {
  const open = useContext(FileViewContext);
  const url = useSearchfoxUrl(text);
  const match = open && hunks && diffId ? findInHunks(text, hunks) : null;
  if (match && open && diffId) {
    const openFile = open;
    return <button className="link-button code-link" title="Show in diff" onClick={() => openFile({ diffId, path: match.path, hunkId: match.hunkId, text: match.text, row: { side: match.side, line: match.line } })}>{text}</button>;
  }
  return url
    ? <a className="link-button code-link nodrag" href={url} target="_blank" rel="noreferrer" title="Searchfox at the patch's merge-base"><code>{text}</code></a>
    : <code>{text}</code>;
}
