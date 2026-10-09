import { createContext, useContext } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DiffFile, Hunk } from "../shared/types.ts";
import { CodeSpan } from "./CodeSpan.tsx";

const CodeLinkTarget = createContext<{ hunks: { file: DiffFile; hunk: Hunk }[]; diffId: string }>({ hunks: [], diffId: "" });

// Module-level so their identity is stable: inline components would remount every code span on each render, and the canvas re-renders a node on mousedown, which swallowed clicks.
const remarkPlugins = [remarkGfm];
const components: Components = {
  code: function InlineCode({ className, children }) {
    const { hunks, diffId } = useContext(CodeLinkTarget);
    const code = String(children);
    return className?.startsWith("language-") || /[\r\n]/.test(code)
      ? <code className={className}>{children}</code>
      : <CodeSpan text={code} hunks={hunks} diffId={diffId} />;
  },
  a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
};

export function AnswerMarkdown({ text, hunks, diffId }: { text: string; hunks: { file: DiffFile; hunk: Hunk }[]; diffId: string }) {
  return <CodeLinkTarget.Provider value={{ hunks, diffId }}><Markdown remarkPlugins={remarkPlugins} components={components}>{text}</Markdown></CodeLinkTarget.Provider>;
}
