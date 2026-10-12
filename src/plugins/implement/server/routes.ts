import { commentPlan } from "../shared/comment-plan.ts";
import type { CommentTriageData, ReviewerCommentsInput, SteerData } from "../shared/types.ts";
import { HttpError, readJson, requireArtifact, requireSession, send, workflowView, putUserArtifact, text as requireText, type Runtime, type Route, type Epoch } from "../../../plugin-api.ts";
import type { PhabCommentData } from "../../review/api.ts";
import { postInlineReplies } from "../../review/api.ts";

/** The phases that read steers. */
const STEERABLE = new Set(["investigate", "implement"]);

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
    ["POST", /^\/api\/sessions\/([^/]+)\/steer$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]!);
      const steerText = requireText(await readJson(req), "text", "The steer").trim();
      const running = rt.runningEpoch(session.id);
      if (!running) throw new HttpError(409, "No epoch is running");
      if (!STEERABLE.has(running.phase)) throw new HttpError(409, `The ${running.phase} phase cannot be steered`);
      const start = rt.store.listArtifacts(session.id, "WorkflowStart").at(-1);
      if (!start) throw new HttpError(409, "Session has no start request");
      let cancelled;
      try { cancelled = await rt.cancelEpoch(session.id); }
      catch (e) { throw new HttpError(409, (e as Error).message); }
      if (cancelled.epoch.status !== "cancelled") throw new HttpError(409, `Epoch ${cancelled.epoch.n} ended ${cancelled.epoch.status} before it could be stopped`);
      const steer = putUserArtifact(rt, session.id, "Steer", { text: steerText, epoch: running.n, phase: running.phase } satisfies SteerData, start.id);
      let retry: Promise<unknown>;
      try { retry = rt.retryPhase(session.id); }
      catch (e) { throw new HttpError(409, (e as Error).message); }
      retry.then(() => rt.advance(session.id)).catch((e) => console.error(`steer retry failed in session ${session.id}: ${(e as Error).message}`));
      send(res, 202, { steerId: steer.id });
    }],
  ];
}
