import { useMemo } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";

const remarkPlugins = [remarkGfm];
const ExternalLink: Components["a"] = ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>;

/** Renderer hooks of `Markdown`. Pass module-level components: a new identity remounts the rendered elements on every render, and the canvas re-renders a node on mousedown, which swallowed clicks. */
export interface MarkdownRenderers { code?: Components["code"]; link?: Components["a"]; listItem?: Components["li"] }

/** GitHub-flavoured markdown; links open in a new tab unless `link` renders them. */
export function Markdown({ text, code, link, listItem, rehypePlugins }: MarkdownRenderers & { text: string; rehypePlugins?: Options["rehypePlugins"] }) {
  const components = useMemo<Components>(() => ({ a: link ?? ExternalLink, ...(code ? { code } : {}), ...(listItem ? { li: listItem } : {}) }), [code, link, listItem]);
  return <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>{text}</ReactMarkdown>;
}
