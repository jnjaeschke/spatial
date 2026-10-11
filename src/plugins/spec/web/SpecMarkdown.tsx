import { Children, createContext, isValidElement, useContext, type ReactNode } from "react";
import type { Components } from "react-markdown";
import { ErrorText, Markdown, useAction } from "../../../web/plugin-api.ts";
import { rehypeSpecSteps } from "./spec-steps.ts";

/** Follows a short spec reference (`SPEC#anchor`) clicked in spec markdown; `step` is the dotted path of the step the link is in, or null. */
export const SpecLinkContext = createContext<{ follow(ref: string, step: string | null): Promise<void> } | null>(null);
const StepExtrasContext = createContext<((step: string) => ReactNode) | null>(null);
const rehypeSteps = [rehypeSpecSteps];

function SpecLink({ specRef, children }: { specRef: string; children: ReactNode }) {
  const links = useContext(SpecLinkContext);
  const action = useAction();
  if (!links) return <span>{children}</span>;
  return <><button type="button" className="link-button spec-link" title={specRef} data-testid="spec-link" disabled={action.busy} onClick={(event) => { const step = event.currentTarget.closest("li[data-step]")?.getAttribute("data-step") ?? null; void action.run(() => links.follow(specRef, step)); }}>{children}</button><ErrorText error={action.error} /></>;
}

// Module-level renderers: see `MarkdownRenderers`.
const SpecLinkRenderer: Components["a"] = ({ href, children }) => /^[A-Za-z0-9-]+#./.test(href ?? "") ? <SpecLink specRef={href!}>{children}</SpecLink> : <a href={href} target="_blank" rel="noreferrer">{children}</a>;
const StepItem: Components["li"] = ({ node: _node, children, ...props }) => {
  const extras = useContext(StepExtrasContext);
  const step = (props as { "data-step"?: string })["data-step"];
  if (!extras || step === undefined) return <li {...props}>{children}</li>;
  const items = Children.toArray(children);
  const nested = items.filter((child) => isValidElement(child) && child.type === "ol");
  return <li {...props}>{items.filter((child) => !nested.includes(child))}{extras(step)}{nested}</li>;
};

/** Webspec section markdown with short spec refs as in-app links. With `steps`, step `<li>`s carry `data-step` and `stepExtras(path)` renders after a step's own content, before its sub-steps. */
export function SpecMarkdown({ text, steps = false, stepExtras }: { text: string; steps?: boolean; stepExtras?(step: string): ReactNode }) {
  const markdown = <Markdown text={text} link={SpecLinkRenderer} listItem={steps ? StepItem : undefined} rehypePlugins={steps ? rehypeSteps : undefined} />;
  return stepExtras ? <StepExtrasContext.Provider value={stepExtras}>{markdown}</StepExtrasContext.Provider> : markdown;
}
