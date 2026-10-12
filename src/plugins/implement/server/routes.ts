import { commentPlan } from "../shared/comment-plan.ts";
import type { CommentTriageData, ReviewerCommentsInput } from "../shared/types.ts";
import { HttpError, readJson, requireArtifact, requireSession, send, workflowView, putUserArtifact, type Runtime, type Route, type Epoch } from "../../../plugin-api.ts";
import type { PhabCommentData } from "../../review/api.ts";
import { postInlineReplies } from "../../review/api.ts";

export function implementRoutes(rt: Runtime): Route[] {
  return [
    ["POST", /^\/api\/sessions\/([^/]+)\/abandon$/, async ({ res, params }) => {
      const session = requireSession(rt, params[0]!);
      if (session.workflow !== "implement") throw new HttpError(409, "Not an implement session");
      const running = rt.runningEpoch(session.id);
      if (running) throw new HttpError(409, `Epoch ${running.n} (${running.phase}) is running`);
      const start = rt.store.listArtifacts(session.id, "WorkflowStart").at(0);
      if (!start) throw new HttpError(409, "The session has not started");
      send(res, 201, { artifactId: putUserArtifact(rt, session.id, "Abandoned", {}, start.id).id });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/reviewer-comments\/([^/]+)\/triage$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]!);
      const commentId = params[1]!;
      const comment = requireArtifact(rt, session.id, commentId, "PhabComment", "comment");
      const body = await readJson(req);
      if (body.action !== "address" && body.action !== "reply" && body.action !== "ignore") throw new HttpError(400, "Invalid action");
      if (body.text !== undefined && typeof body.text !== "string") throw new HttpError(400, "text must be a string");
      const data: CommentTriageData = { comment: commentId, phid: (comment.data as PhabCommentData).phid, action: body.action, text: typeof body.text === "string" ? body.text.trim() || null : null };
      const artifact = putUserArtifact(rt, session.id, "CommentTriage", data, commentId);
      send(res, 201, { artifactId: artifact.id });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/reviewer-comments\/post-replies$/, async ({ res, params }) => {
      const id = requireSession(rt, params[0]!).id;
      const view = workflowView(rt.store, id);
      const epoch = view.epochs.findLast((e) => e.phase === "reviewerComments") as Epoch | undefined;
      if (!epoch) throw new HttpError(409, "No reviewer comments epoch");
      const items = commentPlan(view, epoch).filter((item) => item.action === "reply" && item.text);
      try {
        const result = await postInlineReplies(rt, id, items.map((item) => ({ comment: item.comment, body: item.text! })));
        send(res, 200, result);
      } catch (e) { throw new HttpError(502, (e as Error).message); }
    }],
  ];
}
