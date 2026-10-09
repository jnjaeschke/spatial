import type { Artifact, Epoch } from "../../../plugin-api.ts";
import type { PhabCommentData } from "../../review/api.ts";
import type { CommentAction, CommentInterpretationData, CommentTriageData, ReviewerCommentsInput } from "./types.ts";

export interface CommentPlanItem { comment: Artifact<PhabCommentData>; interpretation: Artifact<CommentInterpretationData> | null; action: CommentAction; text: string | null }

/** The comments of a `reviewerComments` epoch with what happens to each: the user's latest mark, else the interpretation's suggestion. */
export function commentPlan(view: { artifacts: Artifact[] }, epoch: Epoch): CommentPlanItem[] {
  const { comments } = epoch.input as ReviewerCommentsInput;
  return comments.flatMap((phid) => {
    const comment = view.artifacts.findLast((a) => a.type === "PhabComment" && (a.data as PhabCommentData).phid === phid) as Artifact<PhabCommentData> | undefined;
    if (!comment) return [];
    const interpretation = (view.artifacts.findLast((a) => a.type === "CommentInterpretation" && a.epoch === epoch.n && (a.data as CommentInterpretationData).phid === phid) ?? null) as Artifact<CommentInterpretationData> | null;
    const triage = view.artifacts.findLast((a) => a.type === "CommentTriage" && (a.epoch ?? 0) >= epoch.n && (a.data as CommentTriageData).phid === phid) as Artifact<CommentTriageData> | undefined;
    const action = triage?.data.action ?? interpretation?.data.action ?? "address";
    const text = triage ? triage.data.text : interpretation?.data.action === "reply" ? interpretation.data.reply : null;
    return [{ comment, interpretation, action, text }];
  });
}
