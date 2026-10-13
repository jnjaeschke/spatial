import type { Artifact, PhaseViewProps } from "../../../web/plugin-api.ts";
import type { AdoptPlanData, AdoptRangeInput } from "../shared/types.ts";

/** Shows the adopted branch plan and the commit range selected from it. */
export function AdoptView({ state, epoch }: PhaseViewProps) {
  const plan = state.artifacts.findLast((artifact) => artifact.type === "AdoptPlan") as Artifact<AdoptPlanData> | undefined;
  const range = epoch?.phase === "adoptRange" ? epoch.input as AdoptRangeInput : null;
  if (!plan) return <p className="empty">Preparing adoption…</p>;
  const { branches, revisions, diffs, missingBases, refError } = plan.data;
  return <section className="implement-summary" data-testid="adopt-plan">
    {range && <p>Adopting <strong>{range.branch}</strong> through <code>{range.head.slice(0, 12)}</code>.</p>}
    <h3>Branches</h3>
    {branches.map((branch) => <section key={branch.branch}>
      <h4>{branch.branch}</h4><p>Base <code>{branch.base.slice(0, 12)}</code></p>
      <ol>{[...branch.commits].reverse().map((commit) => <li key={commit.sha}>{commit.subject}</li>)}</ol>
    </section>)}
    {revisions.length > 0 && <><h3>Phabricator revisions</h3><ul>{revisions.map((revision) => <li key={revision.id}>D{revision.id}: {revision.title} ({diffs.filter((diff) => diff.revision === revision.id).length} diffs)</li>)}</ul></>}
    {missingBases.length > 0 && <p className="failed">Missing diff bases: {missingBases.map((base) => base.slice(0, 12)).join(", ")}</p>}
    {refError && <p className="failed">{refError}</p>}
  </section>;
}
