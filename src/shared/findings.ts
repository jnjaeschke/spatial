import { diffNumber, narrativeOf } from "./diffs.ts";
import type { Artifact, ChatThreadData, FindingCarryData, FindingDecisionData, FindingVerdictData, Id, Link, PatchNarrativeData, Ref, ReviewFindingData } from "./types.ts";

export type FindingStatus = "open" | "accepted" | "dismissed" | "addressed" | "partially" | "not_addressed";
export interface FindingState {
  finding: Artifact<ReviewFindingData>;
  /** Epoch the finding was raised in. */
  epoch: number;
  /** Current location; `outdated` findings have null anchor, no quote and no lines. */
  anchor: Ref | null;
  quote?: string;
  lines?: ChatThreadData["lines"];
  outdated: boolean;
  decision: FindingDecisionData["decision"] | null;
  verdict: FindingVerdictData | null;
  status: FindingStatus;
  /** Addressed, dismissed or outdated. */
  collapsedByDefault: boolean;
}

export function findingStates(state: { artifacts: Artifact[]; links: Link[] }, narrativeId: Id): FindingState[] {
  const narrative = state.artifacts.find((artifact) => artifact.id === narrativeId && artifact.type === "PatchNarrative") as Artifact<PatchNarrativeData> | undefined;
  if (!narrative) throw new Error(`${narrativeId} is not a PatchNarrative`);
  const own = new Set(state.links.filter((link) => link.kind === "derivedFrom" && link.to === narrativeId).map((link) => link.from));
  const carries = new Map<string, Artifact<FindingCarryData>>();
  for (const artifact of state.artifacts) {
    if (artifact.type !== "FindingCarry") continue;
    const data = artifact.data as FindingCarryData;
    if (data.toDiff === narrative.data.diffId) carries.set(data.finding, artifact as Artifact<FindingCarryData>);
  }
  const findings = state.artifacts.filter((artifact) => artifact.type === "ReviewFinding") as Artifact<ReviewFindingData>[];
  const decisions = new Map<string, Artifact<FindingDecisionData>>(), verdicts = new Map<string, Artifact<FindingVerdictData>>();
  for (const artifact of state.artifacts) {
    if (artifact.type !== "FindingDecision" && artifact.type !== "FindingVerdict") continue;
    const data = artifact.data as FindingDecisionData | FindingVerdictData;
    if (!state.links.some((link) => link.from === artifact.id && link.kind === "about" && link.to === data.finding)) continue;
    if (artifact.type === "FindingDecision") decisions.set(data.finding, artifact as Artifact<FindingDecisionData>);
    else verdicts.set(data.finding, artifact as Artifact<FindingVerdictData>);
  }
  return findings.flatMap((finding) => {
    const isOwn = own.has(finding.id);
    const carry = carries.get(finding.id);
    if (!isOwn && !carry) return [];
    const source = state.links.find((link) => link.from === finding.id && link.kind === "derivedFrom");
    const sourceNarrative = source ? state.artifacts.find((artifact) => artifact.id === source.to && artifact.type === "PatchNarrative") as Artifact<PatchNarrativeData> | undefined : undefined;
    if (!sourceNarrative) return [];
    const epoch = diffNumber(state.artifacts, sourceNarrative.data.diffId);
    const outdated = !isOwn && carry!.data.hunkId === null;
    const anchor = isOwn ? finding.data.anchor : outdated ? null : `${narrative.data.diffId}#${carry!.data.hunkId}`;
    const quote = outdated ? undefined : finding.data.quote;
    const lines = outdated ? undefined : isOwn ? finding.data.lines : carry!.data.lines;
    const decisionArtifact = decisions.get(finding.id), verdictArtifact = verdicts.get(finding.id);
    const decision = decisionArtifact ? (decisionArtifact.data as FindingDecisionData).decision : null;
    const verdict = verdictArtifact ? verdictArtifact.data as FindingVerdictData : null;
    const status: FindingStatus = decision === "dismissed" ? "dismissed" : verdict ? verdict.verdict : decision === "accepted" ? "accepted" : "open";
    return [{ finding, epoch, anchor, ...(quote !== undefined ? { quote } : {}), ...(lines !== undefined ? { lines } : {}), outdated, decision, verdict, status, collapsedByDefault: outdated || status === "dismissed" || status === "addressed" }];
  });
}
