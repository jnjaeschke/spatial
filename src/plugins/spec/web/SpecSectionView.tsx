import type { ReactNode } from "react";
import type { Artifact } from "../../../web/plugin-api.ts";
import type { SpecReferenceData } from "../shared/types.ts";
import { SpecMarkdown } from "./SpecMarkdown.tsx";

/** Renders a resolved spec section or the reason an unresolved reference could not be opened. */
export function SpecSectionView({ spec, status, children }: { spec: Artifact<SpecReferenceData>; status?: ReactNode; children?: ReactNode }) {
  const resolved = spec.data.resolved;
  if (!resolved) return <div className="spec-panel-content"><span className="badge unverified">unverified</span><p className="failed">{spec.data.reason}</p><a href={spec.data.url} target="_blank" rel="noreferrer">open spec</a></div>;
  return <div className="spec-panel-content">
    <header className="spec-panel-heading"><span className="spec-view-title">{resolved.title}</span><a href={resolved.url} target="_blank" rel="noreferrer">open spec</a>{spec.status !== "verified" && <span className="badge unverified">unverified</span>}{spec.status === "verified" && spec.data.origin === "code" && <span className="badge cited">cited in code</span>}{spec.status === "verified" && spec.data.origin === "llm" && <span className="badge inferred">inferred</span>}{spec.status === "verified" && spec.data.origin === "link" && <span className="badge linked">linked</span>}</header>
    {spec.data.geckoRefs.length > 0 && <ul className="files">{spec.data.geckoRefs.map((g) => <li key={g.url}><a href={g.url} target="_blank" rel="noreferrer">{g.group}: {g.path}:{g.line}</a></li>)}</ul>}
    {spec.data.geckoRefsError && <p className="failed">Searchfox: {spec.data.geckoRefsError}</p>}
    {status}
    <div className="spec-section-text"><SpecMarkdown text={resolved.content} /></div>
    {children}
  </div>;
}
