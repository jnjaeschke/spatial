import type { Artifact, ChatThreadData, Link, PostedCommentData, ReviewCommentData, ReviewFindingData } from "./types.ts";
import { findingStates } from "./findings.ts";

export interface PostableComment {
  finding: Artifact<ReviewFindingData>;
  comment: Artifact<ReviewCommentData>;
  lines?: ChatThreadData["lines"];
}

/** Returns each accepted finding's latest verified comment unless that comment was already posted. */
export function postableComments(state: { artifacts: Artifact[]; links: Link[] }, narrativeId: string | null): PostableComment[] {
  if (narrativeId === null) return [];
  const linkedTo = (artifactId: string, targetId: string) => state.links.some((link) => link.from === artifactId && link.to === targetId && link.kind === "about");
  const comments = state.artifacts.filter((a) => a.type === "ReviewComment") as Artifact<ReviewCommentData>[];
  const posted = state.artifacts.filter((a) => a.type === "PostedComment") as Artifact<PostedCommentData>[];
  const result: PostableComment[] = [];

  for (const findingState of findingStates(state, narrativeId)) {
    if (findingState.outdated || findingState.verdict?.verdict === "addressed" || findingState.decision !== "accepted") continue;
    const finding = findingState.finding;
    const comment = comments.filter((artifact) => linkedTo(artifact.id, finding.id)).at(-1);
    if (!comment || comment.status !== "verified") continue;
    if (posted.some((artifact) => artifact.data.comment === comment.id && linkedTo(artifact.id, comment.id))) continue;
    result.push({ finding, comment, lines: findingState.lines });
  }
  return result;
}
