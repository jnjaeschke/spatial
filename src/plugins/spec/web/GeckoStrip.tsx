import { useEffect, useState } from "react";
import { ErrorText, plural, showSessionView, useAction } from "../../../web/plugin-api.ts";
import type { EngineMapping } from "../shared/types.ts";
import { codeUrl, mappedSteps, siteKey, siteName } from "../shared/engine.ts";
import type { SpecStep } from "../shared/steps.ts";
import { describedStep } from "../shared/step-comments.ts";
import { CodePeek } from "./CodePeek.tsx";
import { EngineStatus, SiteItem, type SiteActions } from "./EngineSites.tsx";

/** Where Gecko implements an algorithm, under the box's title: a toggle naming how many functions and tests, opening their list (open by itself while a proposal waits for a decision). */
export function GeckoStrip({ mapping, activity, notFound, actions, algorithmRef, sessionId }: { mapping: EngineMapping | null | undefined; activity: { mapping: boolean; searching: boolean; error: string | null }; notFound: { note: string; reasons: string[] } | null; actions: SiteActions | null; algorithmRef: string; sessionId: string }) {
  const [chosen, setChosen] = useState<boolean | null>(null);
  const action = useAction();
  const sites = mapping?.sites ?? [];
  const tests = mapping ? [...mapping.tests].sort((a, b) => a.group.localeCompare(b.group) || a.path.localeCompare(b.path) || a.line - b.line) : [];
  const proposed = sites.some((site) => site.method === "llm" && !site.stale);
  // A proposal opens the list and keeps it open after the decision, until the user closes it.
  useEffect(() => { if (proposed && chosen === null) setChosen(true); }, [proposed, chosen]);
  const open = chosen ?? proposed;
  const listed = sites.length > 0 || tests.length > 0;
  return <div className="spec-impl nodrag" data-testid="spec-impl">
    <div className="spec-impl-row">
      {listed ? <button type="button" className="link-button spec-impl-toggle" aria-expanded={open} onClick={() => setChosen(!open)}>{open ? "▾" : "▸"} Gecko: {plural(sites.length, "function")}{tests.length ? ` · ${plural(tests.length, "test")}` : ""}</button> : <span className="spec-impl-label">Gecko</span>}
      <EngineStatus engine="gecko" mapping={mapping} working={mapping === undefined || activity.mapping ? "checking…" : activity.searching ? "searching…" : null} notFound={notFound} find={actions && { run: () => void action.run(() => actions.find(null)), busy: action.busy }} testIds={{ notFound: "spec-not-found", find: "spec-find-gecko" }} />
      <button type="button" className="link-button" data-testid="impl-open" onClick={() => showSessionView("impl", { ref: algorithmRef })}>Implementations</button>
    </div>
    <ErrorText error={action.error ?? activity.error} />
    {mapping && open && <>
      {sites.length > 0 && <ul className="spec-impl-sites">{sites.map((site) => <SiteItem key={siteKey(site)} sessionId={sessionId} engine="gecko" mapping={mapping} site={site} actions={actions} showPath />)}</ul>}
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
