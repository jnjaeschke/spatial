import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DiffFile, Hunk } from "../shared/types.ts";
import { CodeSpan } from "./CodeSpan.tsx";

export function AnswerMarkdown({ text, hunks, diffId }: { text: string; hunks: { file: DiffFile; hunk: Hunk }[]; diffId: string }) {
  return <Markdown remarkPlugins={[remarkGfm]} components={{
    code: ({ className, children }) => {
      const code = String(children);
      return className?.startsWith("language-") || /[\r\n]/.test(code)
        ? <code className={className}>{children}</code>
        : <CodeSpan text={code} hunks={hunks} diffId={diffId} />;
    },
    a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
  }}>{text}</Markdown>;
}
