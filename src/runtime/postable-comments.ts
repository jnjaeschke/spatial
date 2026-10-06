import type { Artifact, FindingDecisionData, PostedCommentData, ReviewCommentData, ReviewFindingData } from "../shared/types.ts";
import type { Store } from "./store.ts";

export interface PostableComment {
  finding: Artifact<ReviewFindingData>;
  comment: Artifact<ReviewCommentData>;
}

/** Returns each accepted finding's latest verified comment unless that comment was already posted. */
export function postableComments(store: Store, sessionId: string): PostableComment[] {
  const links = store.listLinks(sessionId);
  const linkedTo = (artifactId: string, targetId: string) => links.some((link) =>
    link.from === artifactId && link.to === targetId && link.kind === "about",
  );
  const findings = store.listArtifacts(sessionId, "ReviewFinding") as Artifact<ReviewFindingData>[];
  const decisions = store.listArtifacts(sessionId, "FindingDecision") as Artifact<FindingDecisionData>[];
  const comments = store.listArtifacts(sessionId, "ReviewComment") as Artifact<ReviewCommentData>[];
  const posted = store.listArtifacts(sessionId, "PostedComment") as Artifact<PostedCommentData>[];
  const result: PostableComment[] = [];

  for (const finding of findings) {
    const decision = decisions.filter((artifact) => linkedTo(artifact.id, finding.id)).at(-1);
    if (decision?.data.decision !== "accepted") continue;
    const comment = comments.filter((artifact) => linkedTo(artifact.id, finding.id)).at(-1);
    if (!comment || comment.status !== "verified") continue;
    if (posted.some((artifact) => artifact.data.comment === comment.id && linkedTo(artifact.id, comment.id))) continue;
    result.push({ finding, comment });
  }
  return result;
}
