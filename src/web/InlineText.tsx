import type { DiffFile, Hunk } from "../shared/types.ts";
import { splitInlineCode } from "./inline-code.ts";
import { CodeSpan } from "./CodeSpan.tsx";

export function InlineText({ text, hunks, diffId }: { text: string; hunks?: { file: DiffFile; hunk: Hunk }[]; diffId?: string }) {
  return <>{splitInlineCode(text).map((part, i) => part.code
    ? <CodeSpan key={i} text={part.text} hunks={hunks} diffId={diffId} />
    : part.text)}</>;
}
