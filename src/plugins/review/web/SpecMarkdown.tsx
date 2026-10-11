import { createContext, useContext, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ErrorText, useAction } from "../../../web/plugin-api.ts";

/** Opens a linked spec reference in the review side panel. */
export const SpecLinkContext = createContext<{ follow(ref: string): Promise<void> } | null>(null);

const remarkPlugins = [remarkGfm];
const components: Components = {
  a: ({ href, children }) => /^[A-Za-z0-9-]+#./.test(href ?? "")
    ? <SpecLink specRef={href!}>{children}</SpecLink>
    : <a href={href} target="_blank" rel="noreferrer">{children}</a>,
};

function SpecLink({ specRef, children }: { specRef: string; children: ReactNode }) {
  const links = useContext(SpecLinkContext);
  const action = useAction();
  if (!links) return <span>{children}</span>;
  return <><button type="button" className="link-button spec-link" title={specRef} data-testid="spec-link" disabled={action.busy} onClick={() => void action.run(() => links.follow(specRef))}>{children}</button><ErrorText error={action.error} /></>;
}

/** Renders webspec section content as markdown and turns short spec refs into in-app links. */
export function SpecMarkdown({ text }: { text: string }) {
  return <Markdown remarkPlugins={remarkPlugins} components={components}>{text}</Markdown>;
}
