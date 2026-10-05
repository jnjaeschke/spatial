import { useContext } from "react";
import type { DiffFile, Hunk } from "../shared/types.ts";
import { FileViewContext } from "./FilePanel.tsx";
import { findInHunks, splitInlineCode } from "./inline-code.ts";

export function InlineText({ text, hunks, diffId }: { text: string; hunks?: { file: DiffFile; hunk: Hunk }[]; diffId?: string }) {
  const open = useContext(FileViewContext);
  return <>{splitInlineCode(text).map((part, i) => {
    if (!part.code) return part.text;
    const match = open && hunks && diffId ? findInHunks(part.text, hunks) : null;
    if (match && open && diffId) {
      const openFile = open;
      return <button key={i} className="code-link" title="Show in diff" onClick={() => openFile({ diffId, ...match })}>{part.text}</button>;
    }
    return <code key={i}>{part.text}</code>;
  })}</>;
}
