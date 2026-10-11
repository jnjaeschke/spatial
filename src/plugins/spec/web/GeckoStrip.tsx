import { useState } from "react";
import type { EngineMapping, EngineSite } from "../shared/types.ts";
import { codeUrl, mappedSteps, siteKey, siteName } from "../shared/engine.ts";

const siteTitle = (site: EngineSite) => [`${site.path}:${site.line}`, site.method === "spec-link" ? `Spec-link comment on line ${site.refs.join(", ")}` : site.method === "llm" ? `Proposed by the LLM: ${site.why ?? ""}` : "Confirmed by you", site.stale ? "This code is gone at the current revision" : ""].filter(Boolean).join("\n");

/** A Gecko site as a permalink named by its function; proposals dashed, stale sites struck through. */
function GeckoSite({ mapping, site }: { mapping: EngineMapping; site: EngineSite }) {
  const link = <a className={`spec-site method-${site.method}`} href={codeUrl(mapping, site.path, site.line)} target="_blank" rel="noreferrer" title={siteTitle(site)}>{siteName(site)}</a>;
  return <span className="spec-site-item">{site.stale ? <s>{link}</s> : link}</span>;
}

/** The Implementations strip under an algorithm box's title: where Gecko implements it and the tests that link it, on one line. */
export function GeckoStrip({ mapping, activity }: { mapping: EngineMapping | null | undefined; activity: { mapping: boolean; searching: boolean } }) {
  const [testsOpen, setTestsOpen] = useState(false);
  const note = mapping === undefined || (mapping === null && activity.mapping) ? "checking…" : mapping === null ? "not mapped" : !mapping.sites.some((site) => !site.stale) ? "no spec-link comments" : null;
  const tests = mapping ? [...mapping.tests].sort((a, b) => a.group.localeCompare(b.group) || a.path.localeCompare(b.path) || a.line - b.line) : [];
  return <div className="spec-impl nodrag" data-testid="spec-impl">
    <div className="spec-impl-row">
      <span className="spec-impl-label">Gecko</span>
      {mapping && mapping.sites.map((site) => <GeckoSite key={siteKey(site)} mapping={mapping} site={site} />)}
      {note && <span className="spec-impl-note">{note}</span>}
      {tests.length > 0 && <button type="button" className="link-button spec-impl-tests" aria-expanded={testsOpen} onClick={() => setTestsOpen(!testsOpen)}>{tests.length} {tests.length === 1 ? "test" : "tests"}</button>}
    </div>
    {mapping && testsOpen && <ul className="spec-impl-test-list">{tests.map((t) => <li key={`${t.path}:${t.line}`}><span className="spec-impl-group">{t.group}</span> <a href={codeUrl(mapping, t.path, t.line)} target="_blank" rel="noreferrer">{t.path}:{t.line}</a></li>)}</ul>}
  </div>;
}

/** Links from a step to the Gecko lines whose Step comments name it; a mismatch shows webspec-index's verdict as its title. */
export function GeckoStepLinks({ mapping, step }: { mapping: EngineMapping | null | undefined; step: string }) {
  if (!mapping) return null;
  return <>{mappedSteps(mapping, step).map(({ site, step: mapped }) => <a key={`${siteKey(site)}:${mapped.line}`} className={`spec-g-link ${mapped.verdict}`} data-testid="spec-g-link" href={codeUrl(mapping, site.path, mapped.line)} target="_blank" rel="noreferrer" aria-label={`Gecko step ${step}: ${site.path}:${mapped.line}`} title={mapped.verdict === "match" ? `${siteName(site)}, ${site.path}:${mapped.line}` : mapped.detail}>G</a>)}</>;
}
