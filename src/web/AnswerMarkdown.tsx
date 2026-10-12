import { createContext, useContext } from "react";
import { defaultUrlTransform, type Components } from "react-markdown";
import type { DiffFile, Hunk } from "../shared/types.ts";
import { CodeSpan, useSearchfoxUrl } from "./CodeSpan.tsx";
import { ConversationItemsContext } from "./conversation-items.ts";
import { localLinkToken } from "./local-links.ts";
import { ExternalLink, Markdown } from "./Markdown.tsx";

const CodeLinkTarget = createContext<{ hunks: { file: DiffFile; hunk: Hunk }[]; diffId: string }>({ hunks: [], diffId: "" });

// Module-level so its identity is stable: inline components would remount every code span on each render, and the canvas re-renders a node on mousedown, which swallowed clicks.
const InlineCode: NonNullable<Components["code"]> = function InlineCode({ className, children }) {
  const { hunks, diffId } = useContext(CodeLinkTarget);
  const code = String(children);
  return className?.startsWith("language-") || /[\r\n]/.test(code)
    ? <code className={className}>{children}</code>
    : <CodeSpan text={code} hunks={hunks} diffId={diffId} />;
};

// A link to a local file (chat agents link `/worktree/path.cpp:12`) is a code token at the session's revision; without a Searchfox link it reads as code.
const LocalLink: NonNullable<Components["a"]> = function LocalLink(props) {
  const token = localLinkToken(props.href, useContext(ConversationItemsContext)?.worktree);
  const url = useSearchfoxUrl(token);
  if (token === null) return <ExternalLink href={props.href}>{props.children}</ExternalLink>;
  return url
    ? <a className="code-link nodrag" href={url} target="_blank" rel="noreferrer" title="Searchfox at the patch's merge-base"><code>{props.children}</code></a>
    : <code>{props.children}</code>;
};

// The default transform drops `path.cpp:12` as an unknown protocol; the link renderer shows such links as code or Searchfox links, never as an href.
const keepLocalLinks = (url: string) => localLinkToken(url, undefined) === null ? defaultUrlTransform(url) : url;

export function AnswerMarkdown({ text, hunks, diffId }: { text: string; hunks: { file: DiffFile; hunk: Hunk }[]; diffId: string }) {
  return <CodeLinkTarget.Provider value={{ hunks, diffId }}><Markdown text={text} code={InlineCode} link={LocalLink} urlTransform={keepLocalLinks} /></CodeLinkTarget.Provider>;
}
