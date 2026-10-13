import { useId } from "react";
import { ErrorText, IconButton, useAction } from "../../../web/plugin-api.ts";
import { ENGINE_LABEL } from "../shared/engines.ts";
import type { Engine } from "../shared/types.ts";
import type { EngineMapping, EngineSite } from "../shared/types.ts";
import { codeUrl, isDeclaration, siteKey, siteName } from "../shared/engine.ts";
import { CodePeek } from "./CodePeek.tsx";

/** A site's tooltip: its place, how it was found, and whether its code is gone. */
export const siteTitle = (site: EngineSite) => [`${site.path}:${site.line}`, site.method === "spec-link" ? `Spec-link comment on line ${site.refs.join(", ")}` : site.method === "spec-link-heuristic" ? `Spec-link comment on ${site.declaration ? `${site.declaration.path} ` : ""}line ${site.refs.join(", ")}, function found by brace scan` : site.method === "llm" ? "Proposed by the LLM" : "Confirmed by you", site.declaration ? `Defines the declaration at ${site.declaration.path}:${site.declaration.line}` : "", site.stale ? "This code is gone at the current revision" : ""].filter(Boolean).join("\n");

/** What the user can do to one engine's mapping of an algorithm; `find(null)` searches anew, `find(key)` replaces a stale site. Without `align` no site offers Align steps. */
export interface SiteActions {
  find(stale: string | null): Promise<unknown>;
  decide(key: string, decision: "confirm" | "reject"): Promise<unknown>;
  align?(key: string): Promise<unknown>;
}

/** A site in an engine's list: a permalink named by its function with a peek at the code (`showPath` adds its file and line); stale sites struck through, with Find again. A proposal is badged "AI-proposed" with the LLM's reason in plain text and Confirm and Reject beside it. */
export function SiteItem({ sessionId, engine, mapping, site, actions, showPath = false }: { sessionId: string; engine: Engine; mapping: EngineMapping; site: EngineSite; actions: SiteActions | null; showPath?: boolean }) {
  const action = useAction();
  const name = siteName(site);
  const key = siteKey(site);
  const whyId = useId();
  const proposal = site.method === "llm" && !site.stale;
  const declaration = isDeclaration(site);
  const alignable = site.method !== "llm" && !site.stale && !declaration && !site.steps.some((step) => step.verdict !== "proposed");
  const button = (label: string, text: string, job: () => Promise<unknown>) => <IconButton className="link-button" label={label} disabled={action.busy} onClick={() => void action.run(job)}>{text}</IconButton>;
  const link = <a className={`impl-site-link method-${site.method}`} href={codeUrl(mapping, site.path, site.line)} target="_blank" rel="noreferrer" data-testid={`impl-site-${engine}`} title={siteTitle(site)} aria-describedby={proposal && site.why ? whyId : undefined}>{name}</a>;
  return <li className={`impl-site method-${site.method}${site.stale ? " stale" : ""}`}>
    {site.stale ? link : <CodePeek sessionId={sessionId} engine={engine} path={site.path} line={site.line} quote={site.quote}>{link}</CodePeek>}
    {showPath && <span className="impl-note">{site.path}:{site.line}</span>}
    {declaration && <span className="impl-note" title="A spec-link comment above a declaration: there is no function body to align steps with">declaration</span>}
    {proposal && <span className="badge">AI-proposed</span>}
    {proposal && site.why && <span id={whyId} className="impl-note">{site.why}</span>}
    {actions && proposal && <>{button(`Confirm ${name}`, "Confirm", () => actions.decide(key, "confirm"))}{button(`Reject ${name}`, "Reject", () => actions.decide(key, "reject"))}</>}
    {actions && site.stale && button(`Find again: ${name}`, "Find again", () => actions.find(key))}
    {actions?.align && alignable && button(`Align steps ${name}`, "Align steps", () => actions.align!(key))}
    <ErrorText error={action.error} />
  </li>;
}

/** Where one engine's mapping of an algorithm stands, beside its sites: `working` while a task runs, else not mapped, no spec-link comments, what the last search found nothing for, and Find in <Engine>. */
export function EngineStatus({ engine, mapping, working, notFound, find, testIds }: { engine: Engine; mapping: EngineMapping | null | undefined; working: string | null; notFound: { note: string; reasons: string[] } | null; find: { run(): void; busy: boolean } | null; testIds: { notFound: string; find?: string } }) {
  if (working) return <span className="impl-note">{working}</span>;
  if (mapping === null) return <span className="impl-note">not mapped</span>;
  if (!mapping || mapping.sites.some((site) => !site.stale)) return null;
  return <>
    <span className="impl-note">no spec-link comments</span>
    {notFound && <span className="impl-note" data-testid={testIds.notFound} title={notFound.reasons.join("\n")}>{notFound.note}</span>}
    {find && <button type="button" className="link-button" data-testid={testIds.find} disabled={find.busy} onClick={find.run}>Find in {ENGINE_LABEL[engine]}</button>}
  </>;
}
