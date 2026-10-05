import { useContext } from "react";
import type { DiffFile, Hunk } from "../shared/types.ts";
import { FileViewContext } from "./FilePanel.tsx";
import { findInHunks, splitInlineCode } from "./inline-code.ts";
import { SearchfoxContext, searchUrl } from "./searchfox-url.ts";

export function InlineText({ text, hunks, diffId }: { text: string; hunks?: { file: DiffFile; hunk: Hunk }[]; diffId?: string }) {
  const sf = useContext(SearchfoxContext);
  const open = useContext(FileViewContext);
  return <>{splitInlineCode(text).map((part, i) => {
    if (!part.code) return part.text;
    const match = open && hunks && diffId ? findInHunks(part.text, hunks) : null;
    if (match && open && diffId) {
      const openFile = open;
      return <button key={i} className="code-link" title="Show in diff" onClick={() => openFile({ diffId, ...match })}>{part.text}</button>;
    }
    return sf
      ? <a key={i} className="code-link nodrag" href={searchUrl(sf, part.text)} target="_blank" rel="noreferrer" title="Search on Searchfox"><code>{part.text}</code></a>
      : <code key={i}>{part.text}</code>;
  })}</>;
}
