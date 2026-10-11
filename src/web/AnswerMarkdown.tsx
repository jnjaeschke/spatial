import { createContext, useContext } from "react";
import type { Components } from "react-markdown";
import type { DiffFile, Hunk } from "../shared/types.ts";
import { CodeSpan } from "./CodeSpan.tsx";
import { Markdown } from "./Markdown.tsx";

const CodeLinkTarget = createContext<{ hunks: { file: DiffFile; hunk: Hunk }[]; diffId: string }>({ hunks: [], diffId: "" });

// Module-level so its identity is stable: inline components would remount every code span on each render, and the canvas re-renders a node on mousedown, which swallowed clicks.
const InlineCode: NonNullable<Components["code"]> = function InlineCode({ className, children }) {
  const { hunks, diffId } = useContext(CodeLinkTarget);
  const code = String(children);
  return className?.startsWith("language-") || /[\r\n]/.test(code)
    ? <code className={className}>{children}</code>
    : <CodeSpan text={code} hunks={hunks} diffId={diffId} />;
};

export function AnswerMarkdown({ text, hunks, diffId }: { text: string; hunks: { file: DiffFile; hunk: Hunk }[]; diffId: string }) {
  return <CodeLinkTarget.Provider value={{ hunks, diffId }}><Markdown text={text} code={InlineCode} /></CodeLinkTarget.Provider>;
}
