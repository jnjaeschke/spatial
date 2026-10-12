import { useEffect, useId, useState } from "react";
import { ErrorText, IconButton, showSessionView, useAction } from "../../../web/plugin-api.ts";
import type { EngineMapping, EngineSite } from "../shared/types.ts";
import { codeUrl, mappedSteps, siteKey, siteName } from "../shared/engine.ts";
import type { SpecStep } from "../shared/steps.ts";
import { describedStep } from "../shared/step-comments.ts";
import { CodePeek } from "./CodePeek.tsx";

/** A site's tooltip: its place, how it was found, and whether its code is gone. */
export const siteTitle = (site: EngineSite) => [`${site.path}:${site.line}`, site.method === "spec-link" ? `Spec-link comment on line ${site.refs.join(", ")}` : site.method === "spec-link-heuristic" ? `Spec-link comment on line ${site.refs.join(", ")}, function found by brace scan` : site.method === "llm" ? "Proposed by the LLM" : "Confirmed by you", site.stale ? "This code is gone at the current revision" : ""].filter(Boolean).join("\n");

type GeckoActions = { find(stale: string | null): Promise<void>; decide(key: string, decision: "confirm" | "reject"): Promise<void> };

/** A Gecko site in the strip's list: a permalink named by its function, with its file and a peek at the code; stale sites struck through. A proposal is badged "AI-proposed" with the LLM's reason in plain text and Confirm and Reject beside it. */
function GeckoSite({ mapping, site, actions, busy, run, sessionId }: { mapping: EngineMapping; site: EngineSite; actions: GeckoActions | null; busy: boolean; run(job: () => Promise<void>): void; sessionId: string }) {
  const name = siteName(site);
  const whyId = useId();
  const proposal = site.method === "llm" && !site.stale;
  const link = <a className={`spec-site method-${site.method}`} href={codeUrl(mapping, site.path, site.line)} target="_blank" rel="noreferrer" title={siteTitle(site)} aria-describedby={proposal && site.why ? whyId : undefined}>{name}</a>;
  return <li className="spec-site-item">
    {site.stale ? <s>{link}</s> : <CodePeek sessionId={sessionId} engine="gecko" path={site.path} line={site.line} quote={site.quote}>{link}</CodePeek>}
    <span className="spec-impl-note">{site.path}:{site.line}</span>
    {proposal && <span className="badge">AI-proposed</span>}
    {proposal && site.why && <span id={whyId} className="spec-impl-note">{site.why}</span>}
    {actions && proposal && <><IconButton label={`Confirm ${name}`} className="spec-site-action" disabled={busy} onClick={() => run(() => actions.decide(siteKey(site), "confirm"))}>✓</IconButton><IconButton label={`Reject ${name}`} className="spec-site-action" disabled={busy} onClick={() => run(() => actions.decide(siteKey(site), "reject"))}>×</IconButton></>}
    {actions && site.stale && <IconButton label={`Find again: ${name}`} className="link-button" disabled={busy} onClick={() => run(() => actions.find(siteKey(site)))}>Find again</IconButton>}
  </li>;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Where Gecko implements an algorithm, under the box's title: a toggle naming how many functions and tests, opening their list (open by itself while a proposal waits for a decision). */
export function GeckoStrip({ mapping, activity, notFound, actions, algorithmRef, sessionId }: { mapping: EngineMapping | null | undefined; activity: { mapping: boolean; searching: boolean; error: string | null }; notFound: { note: string; reasons: string[] } | null; actions: GeckoActions | null; algorithmRef: string; sessionId: string }) {
  const [chosen, setChosen] = useState<boolean | null>(null);
  const action = useAction();
  const sites = mapping?.sites ?? [];
  const placed = sites.some((site) => !site.stale);
  const note = mapping === undefined || (mapping === null && activity.mapping) ? "checking…" : mapping === null ? "not mapped" : !placed ? "no spec-link comments" : null;
  const tests = mapping ? [...mapping.tests].sort((a, b) => a.group.localeCompare(b.group) || a.path.localeCompare(b.path) || a.line - b.line) : [];
  const proposed = sites.some((site) => site.method === "llm" && !site.stale);
  // A proposal opens the list and keeps it open after the decision, until the user closes it.
  useEffect(() => { if (proposed && chosen === null) setChosen(true); }, [proposed, chosen]);
  const open = chosen ?? proposed;
  const listed = sites.length > 0 || tests.length > 0;
  return <div className="spec-impl nodrag" data-testid="spec-impl">
    <div className="spec-impl-row">
      {listed ? <button type="button" className="link-button spec-impl-toggle" aria-expanded={open} onClick={() => setChosen(!open)}>{open ? "▾" : "▸"} Gecko: {count(sites.length, "function", "functions")}{tests.length ? ` · ${count(tests.length, "test", "tests")}` : ""}</button> : <span className="spec-impl-label">Gecko</span>}
      {note && <span className="spec-impl-note">{note}</span>}
      {!activity.searching && notFound && mapping && !placed && <span className="spec-impl-note" data-testid="spec-not-found" title={notFound.reasons.join("\n")}>{notFound.note}</span>}
      {activity.searching ? <span className="spec-impl-note">searching…</span> : actions && mapping && !placed && <button type="button" className="link-button" data-testid="spec-find-gecko" disabled={action.busy} onClick={() => void action.run(() => actions.find(null))}>Find in Gecko</button>}
      <button type="button" className="link-button" data-testid="impl-open" onClick={() => showSessionView("impl", { ref: algorithmRef })}>Implementations</button>
    </div>
    <ErrorText error={action.error ?? activity.error} />
    {mapping && open && <>
      {sites.length > 0 && <ul className="spec-impl-sites">{sites.map((site) => <GeckoSite key={siteKey(site)} mapping={mapping} site={site} actions={actions} busy={action.busy} run={(job) => void action.run(job)} sessionId={sessionId} />)}</ul>}
      {tests.length > 0 && <ul className="spec-impl-test-list">{tests.map((t) => <li key={`${t.group}|${t.path}:${t.line}`}><span className="spec-impl-group">{t.group}</span> <a href={codeUrl(mapping, t.path, t.line)} target="_blank" rel="noreferrer">{t.path}:{t.line}</a></li>)}</ul>}
    </>}
  </div>;
}

/** Links from a step to the Gecko lines whose Step comments name it, each with a peek at the code. A comment whose text clearly is another step (`describedStep`) says so: the spec renumbered its steps since. */
export function GeckoStepLinks({ mapping, step, steps, sessionId }: { mapping: EngineMapping | null | undefined; step: string; steps: SpecStep[]; sessionId: string }) {
  if (!mapping) return null;
  return <>{mappedSteps(mapping, step).map(({ site, step: mapped }) => {
    const other = mapped.verdict === "mismatch" && mapped.comment ? describedStep(mapped.comment, step, steps) : null;
    const note = other ? `Gecko's comment numbers this step ${step}, but its text is step ${other.number}: “${other.text}” The spec's step numbers changed since the comment was written.` : mapped.verdict === "mismatch" ? `The comment's wording differs from step ${step}.` : `${siteName(site)}: the Step comment for step ${step}.`;
    return <CodePeek key={`${siteKey(site)}:${mapped.line}`} sessionId={sessionId} engine="gecko" path={site.path} line={mapped.line} quote={mapped.quote ?? null} note={note}>
      <a className={`spec-g-link${other ? " outdated" : ""}`} data-testid="spec-g-link" href={codeUrl(mapping, site.path, mapped.line)} target="_blank" rel="noreferrer" aria-label={`Gecko, step ${step}: ${site.path}:${mapped.line}.${other ? ` Comment is step ${other.number}.` : ""}`}>{other ? `Gecko · comment is step ${other.number}` : "Gecko"}</a>
    </CodePeek>;
  })}</>;
}
