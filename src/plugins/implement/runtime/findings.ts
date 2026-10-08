import type { Artifact, Link } from "../../../plugin-api.ts";
import type { FindingDecisionData, FindingVerdictData, ReviewFindingData } from "../../review/api.ts";

/** High-severity review findings that are still open: not dismissed, and not judged addressed by a later review. Reads the review plugin's artifacts by type; `findingStates` needs a narrative and would hide findings of earlier epochs this loop still has to resolve. */
export function openHighFindings(view: { artifacts: Artifact[]; links: Link[] }): Artifact<ReviewFindingData>[] {
  const latestAbout = (type: string, finding: Artifact) => {
    const ids = new Set(view.links.filter((link) => link.kind === "about" && link.to === finding.id).map((link) => link.from));
    return view.artifacts.filter((a) => a.type === type && ids.has(a.id)).at(-1);
  };
  return (view.artifacts.filter((a) => a.type === "ReviewFinding") as Artifact<ReviewFindingData>[]).filter((finding) => {
    if (finding.data.severity !== "high") return false;
    if ((latestAbout("FindingDecision", finding)?.data as FindingDecisionData | undefined)?.decision === "dismissed") return false;
    return (latestAbout("FindingVerdict", finding)?.data as FindingVerdictData | undefined)?.verdict !== "addressed";
  });
}

export function describeFinding(finding: Artifact<ReviewFindingData>): string {
  const where = finding.data.lines ? ` (${finding.data.lines.path}:${finding.data.lines.start})` : "";
  return `- [${finding.data.severity}] ${finding.data.title}${where}\n  ${finding.data.body}`;
}
