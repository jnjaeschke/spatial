import type { PhabCommentData, ReviewCommentData, ReviewDraftData, UserCommentData } from "./types.ts";
import type { Artifact, ChatThreadData, Link, PostedCommentData } from "../../../plugin-api.ts";
import { findingStates } from "./findings.ts";

export interface PostableComment {
  source: Artifact;
  body: string;
  lines?: ChatThreadData["lines"];
  /** Stable Phabricator-post identity: ReviewComment for findings, UserComment for local comments. */
  comment: Artifact;
}

/** Current version per first artifact id, excluding deleted comments. */
export function currentUserComments(artifacts: Artifact[]): Artifact<UserCommentData>[] {
  const latest = new Map<string, Artifact<UserCommentData>>();
  for (const artifact of artifacts) {
    if (artifact.type !== "UserComment") continue;
    const comment = artifact as Artifact<UserCommentData>;
    latest.set(comment.data.replaces ?? comment.id, comment);
  }
  return [...latest.values()].filter((comment) => comment.status === "verified" && !comment.data.deleted);
}

export function reviewDraft(artifacts: Artifact[], revision: number): string {
  return (artifacts.filter((artifact) => artifact.type === "ReviewDraft" && (artifact.data as ReviewDraftData).revision === revision).at(-1)?.data as ReviewDraftData | undefined)?.body ?? "";
}

/** The general review comment `draft` with `reply` appended below a quote of the first line of the Phabricator `comment` it answers. */
export function withGeneralReply(draft: string, comment: PhabCommentData, reply: string): string {
  const quote = `> @${comment.author}: ${comment.body.split(/\r?\n/, 1)[0]}`;
  return `${draft.trim() ? `${draft.trimEnd()}\n\n` : ""}${quote}\n\n${reply}`;
}

/** The local general comment after the server draft changed from `previous` to `next`: an append-only change is appended to unsent edits, any other change replaces only an unedited `local`. */
export function mergeServerDraft(local: string, previous: string, next: string): string {
  if (!next.startsWith(previous)) return local === previous ? next : local;
  const suffix = next.slice(previous.length);
  return local + (local.trim() && suffix && !suffix.startsWith("\n") ? "\n\n" : "") + suffix;
}

/** Accepted findings first, then unposted local comments on the Diff owned by this narrative. */
export function postableComments(state: { artifacts: Artifact[]; links: Link[] }, narrativeId: string | null): PostableComment[] {
  if (narrativeId === null) return [];
  const linkedTo = (artifactId: string, targetId: string) => state.links.some((link) => link.from === artifactId && link.to === targetId && link.kind === "about");
  const posted = state.artifacts.filter((a) => a.type === "PostedComment") as Artifact<PostedCommentData>[];
  const isPosted = (id: string) => posted.some((artifact) => artifact.data.comment === id && linkedTo(artifact.id, id));
  const comments = state.artifacts.filter((a) => a.type === "ReviewComment") as Artifact<ReviewCommentData>[];
  const result: PostableComment[] = [];

  for (const findingState of findingStates(state, narrativeId)) {
    if (findingState.outdated || findingState.verdict?.verdict === "addressed" || findingState.decision !== "accepted") continue;
    const finding = findingState.finding;
    const comment = comments.filter((artifact) => linkedTo(artifact.id, finding.id)).at(-1);
    if (!comment || comment.status !== "verified" || isPosted(comment.id)) continue;
    result.push({ source: finding, comment, body: comment.data.body, lines: findingState.lines });
  }

  const narrative = state.artifacts.find((artifact) => artifact.id === narrativeId && artifact.type === "PatchNarrative");
  const diffId = (narrative?.data as { diffId?: string } | undefined)?.diffId;
  const diff = state.artifacts.filter((artifact) => artifact.type === "Diff" && (diffId ? artifact.id === diffId : true)).at(-1);
  if (diff) {
    for (const comment of currentUserComments(state.artifacts).filter((item) => item.data.diffId === diff.id)) {
      const stableId = comment.data.replaces ?? comment.id;
      if (isPosted(stableId)) continue;
      result.push({ source: comment, comment, body: comment.data.body, lines: comment.data.lines });
    }
  }
  return result;
}
