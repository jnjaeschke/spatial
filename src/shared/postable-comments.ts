import type { Artifact, FindingDecisionData, Link, PostedCommentData, ReviewCommentData, ReviewFindingData } from "./types.ts";

export interface PostableComment {
  finding: Artifact<ReviewFindingData>;
  comment: Artifact<ReviewCommentData>;
}

/** Returns each accepted finding's latest verified comment unless that comment was already posted. */
export function postableComments(state: { artifacts: Artifact[]; links: Link[] }, narrativeId: string | null): PostableComment[] {
  if (narrativeId === null) return [];
  const linkedTo = (artifactId: string, targetId: string) => state.links.some((link) =>
    link.from === artifactId && link.to === targetId && link.kind === "about",
  );
  const findings = state.artifacts.filter((a) => a.type === "ReviewFinding") as Artifact<ReviewFindingData>[];
  const decisions = state.artifacts.filter((a) => a.type === "FindingDecision") as Artifact<FindingDecisionData>[];
  const comments = state.artifacts.filter((a) => a.type === "ReviewComment") as Artifact<ReviewCommentData>[];
  const posted = state.artifacts.filter((a) => a.type === "PostedComment") as Artifact<PostedCommentData>[];
  const result: PostableComment[] = [];

  for (const finding of findings) {
    if (!state.links.some((link) => link.from === finding.id && link.to === narrativeId && link.kind === "derivedFrom")) continue;
    const decision = decisions.filter((artifact) => linkedTo(artifact.id, finding.id)).at(-1);
    if (decision?.data.decision !== "accepted") continue;
    const comment = comments.filter((artifact) => linkedTo(artifact.id, finding.id)).at(-1);
    if (!comment || comment.status !== "verified") continue;
    if (posted.some((artifact) => artifact.data.comment === comment.id && linkedTo(artifact.id, comment.id))) continue;
    result.push({ finding, comment });
  }
  return result;
}
