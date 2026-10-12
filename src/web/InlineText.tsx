import { useContext } from "react";
import type { DiffFile, Hunk } from "../shared/types.ts";
import { linkText } from "../shared/text-links.ts";
import { splitInlineCode } from "./inline-code.ts";
import { CodeSpan } from "./CodeSpan.tsx";
import { TextLinksContext } from "./text-links.ts";

export function InlineText({ text, hunks, diffId }: { text: string; hunks?: { file: DiffFile; hunk: Hunk }[]; diffId?: string }) {
  const rules = useContext(TextLinksContext);
  return <>{splitInlineCode(text).map((part, i) => part.code
    ? <CodeSpan key={i} text={part.text} hunks={hunks} diffId={diffId} />
    : linkText(part.text, rules).map((piece, j) => piece.href === undefined
      ? piece.text
      : <a key={`${i}.${j}`} className="nodrag" href={piece.href} target="_blank" rel="noreferrer">{piece.text}</a>))}</>;
}
