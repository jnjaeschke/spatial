import { useId, useState } from "react";
import { ErrorText, IconButton, useAction } from "../../../web/plugin-api.ts";
import type { EngineMapping, EngineSite } from "../shared/types.ts";
import { codeUrl, mappedSteps, siteKey, siteName } from "../shared/engine.ts";

const siteTitle = (site: EngineSite) => [`${site.path}:${site.line}`, site.method === "spec-link" ? `Spec-link comment on line ${site.refs.join(", ")}` : site.method === "llm" ? "Proposed by the LLM" : "Confirmed by you", site.stale ? "This code is gone at the current revision" : ""].filter(Boolean).join("\n");

type GeckoActions = { find(stale: string | null): Promise<void>; decide(key: string, decision: "confirm" | "reject"): Promise<void> };

/** A Gecko site as a permalink named by its function; stale sites struck through. A proposal is badged "AI-proposed" with the LLM's reason in plain text and Confirm and Reject beside it. */
function GeckoSite({ mapping, site, actions, busy, run }: { mapping: EngineMapping; site: EngineSite; actions: GeckoActions | null; busy: boolean; run(job: () => Promise<void>): void }) {
  const name = siteName(site);
  const whyId = useId();
  const proposal = site.method === "llm" && !site.stale;
  const link = <a className={`spec-site method-${site.method}`} href={codeUrl(mapping, site.path, site.line)} target="_blank" rel="noreferrer" title={siteTitle(site)} aria-describedby={proposal && site.why ? whyId : undefined}>{name}</a>;
  return <span className="spec-site-item">{site.stale ? <s>{link}</s> : link}
    {proposal && <span className="badge">AI-proposed</span>}
    {proposal && site.why && <span id={whyId} className="spec-impl-note">{site.why}</span>}
    {actions && proposal && <><IconButton label={`Confirm ${name}`} className="spec-site-action" disabled={busy} onClick={() => run(() => actions.decide(siteKey(site), "confirm"))}>✓</IconButton><IconButton label={`Reject ${name}`} className="spec-site-action" disabled={busy} onClick={() => run(() => actions.decide(siteKey(site), "reject"))}>×</IconButton></>}
    {actions && site.stale && <IconButton label={`Find again: ${name}`} className="link-button" disabled={busy} onClick={() => run(() => actions.find(siteKey(site)))}>Find again</IconButton>}
  </span>;
}

/** The Implementations strip under an algorithm box's title: where Gecko implements it and the tests that link it, on one line. */
export function GeckoStrip({ mapping, activity, actions }: { mapping: EngineMapping | null | undefined; activity: { mapping: boolean; searching: boolean; error: string | null }; actions: GeckoActions | null }) {
  const [testsOpen, setTestsOpen] = useState(false);
  const action = useAction();
  const note = mapping === undefined || (mapping === null && activity.mapping) ? "checking…" : mapping === null ? "not mapped" : !mapping.sites.some((site) => !site.stale) ? "no spec-link comments" : null;
  const tests = mapping ? [...mapping.tests].sort((a, b) => a.group.localeCompare(b.group) || a.path.localeCompare(b.path) || a.line - b.line) : [];
  return <div className="spec-impl nodrag" data-testid="spec-impl">
    <div className="spec-impl-row">
      <span className="spec-impl-label">Gecko</span>
      {mapping && mapping.sites.map((site) => <GeckoSite key={siteKey(site)} mapping={mapping} site={site} actions={actions} busy={action.busy} run={(job) => void action.run(job)} />)}
      {note && <span className="spec-impl-note">{note}</span>}
      {tests.length > 0 && <button type="button" className="link-button spec-impl-tests" aria-expanded={testsOpen} onClick={() => setTestsOpen(!testsOpen)}>{tests.length} {tests.length === 1 ? "test" : "tests"}</button>}
      {activity.searching ? <span className="spec-impl-note">searching…</span> : actions && mapping && !mapping.sites.some((site) => !site.stale) && <button type="button" className="link-button" data-testid="spec-find-gecko" disabled={action.busy} onClick={() => void action.run(() => actions.find(null))}>Find in Gecko</button>}
    </div>
    <ErrorText error={action.error ?? activity.error} />
    {mapping && testsOpen && <ul className="spec-impl-test-list">{tests.map((t) => <li key={`${t.group}|${t.path}:${t.line}`}><span className="spec-impl-group">{t.group}</span> <a href={codeUrl(mapping, t.path, t.line)} target="_blank" rel="noreferrer">{t.path}:{t.line}</a></li>)}</ul>}
  </div>;
}

/** Links from a step to the Gecko lines whose Step comments name it; a mismatch shows webspec-index's verdict as its title. */
export function GeckoStepLinks({ mapping, step }: { mapping: EngineMapping | null | undefined; step: string }) {
  if (!mapping) return null;
  return <>{mappedSteps(mapping, step).map(({ site, step: mapped }) => <a key={`${siteKey(site)}:${mapped.line}`} className={`spec-g-link ${mapped.verdict}`} data-testid="spec-g-link" href={codeUrl(mapping, site.path, mapped.line)} target="_blank" rel="noreferrer" aria-label={`Gecko step ${step} ${mapped.verdict}: ${site.path}:${mapped.line}. ${mapped.detail}`} title={mapped.verdict === "match" ? `${siteName(site)}, ${site.path}:${mapped.line}` : mapped.detail}>G</a>)}</>;
}
