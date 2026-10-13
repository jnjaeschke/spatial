import { commentPlan } from "../shared/comment-plan.ts";
import type { CommentTriageData, SteerData } from "../shared/types.ts";
import { HttpError, readJson, requireArtifact, requireSession, send, workflowView, putUserArtifact, text as requireText, type Artifact, type Runtime, type Route, type Epoch } from "../../../plugin-api.ts";
import type { PhabCommentData } from "../../review/api.ts";
import { postInlineReplies } from "../../review/api.ts";
import { rememberSteer } from "../runtime/distill.ts";
import { memoryRoutes } from "./memory-routes.ts";
import { adoptMode, branchState } from "../runtime/branch-watcher.ts";
import type { AdoptInput } from "../shared/types.ts";

/** The phases that read steers. */
const STEERABLE = new Set(["investigate", "implement"]);

export function implementRoutes(rt: Runtime): Route[] {
  const steering = new Set<string>();
  const adopting = new Set<string>();
  return [
    ...memoryRoutes(rt),
    ["POST", /^\/api\/sessions\/([^/]+)\/adopt$/, async ({ res, params }) => {
      const session = requireSession(rt, params[0]!);
      if (session.workflow !== "implement") throw new HttpError(409, "Not an implement session");
      const running = rt.runningEpoch(session.id);
      if (running) throw new HttpError(409, `Epoch ${running.n} (${running.phase}) is running`);
      if (adopting.has(session.id)) throw new HttpError(409, "An adopt is already starting for this session");
      adopting.add(session.id);
      let started = false;
      try {
        const state = await branchState(rt.gitFor(session.id), workflowView(rt.store, session.id));
        const mode = state && adoptMode(state);
        if (!mode) throw new HttpError(409, "The branch has not moved");
        const run = rt.runPhase(session.id, "adopt", { mode } satisfies AdoptInput);
        started = true;
        void run.then(() => rt.advance(session.id))
          .catch((e: unknown) => console.error(`adopt failed in session ${session.id}: ${(e as Error).message}`))
          .finally(() => adopting.delete(session.id));
        send(res, 202, { mode });
      } finally { if (!started) adopting.delete(session.id); }
    }],
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
      if (session.workflow !== "implement") throw new HttpError(409, "Not an implement session");
      if (steering.has(session.id)) throw new HttpError(409, "A steer is already being handled for this session");
      steering.add(session.id);
      try {
        const body = await readJson(req);
        const steerText = requireText(body, "text", "The steer").trim();
        if (body.live !== undefined && typeof body.live !== "boolean") throw new HttpError(400, "live must be a boolean");
        const running = rt.runningEpoch(session.id);
        if (!running) throw new HttpError(409, "No epoch is running");
        if (!STEERABLE.has(running.phase)) throw new HttpError(409, `The ${running.phase} phase cannot be steered`);
        const start = rt.store.listArtifacts(session.id, "WorkflowStart").at(-1);
        if (!start) throw new HttpError(409, "Session has no start request");
        if (body.live) {
          const [taskId] = rt.sendLiveInput(session.id, `${steerText}\n\n(The user sent this while you work. Take it into account and carry on.)`);
          if (!taskId) throw new HttpError(409, "The agent is not reading messages right now (a Codex run, or between agent runs); use Stop & steer");
          const steer = putUserArtifact(rt, session.id, "Steer", { text: steerText, epoch: running.n, phase: running.phase, live: true } satisfies SteerData, start.id);
          rememberSteer(rt, session.id, steer as Artifact<SteerData>, taskId).catch((e) => console.error(`distillSteer failed in session ${session.id}: ${(e as Error).message}`));
          send(res, 202, { steerId: steer.id });
          return;
        }
        let cancelled;
        try { cancelled = await rt.cancelEpoch(session.id); }
        catch (e) { throw new HttpError(409, (e as Error).message); }
        if (cancelled.epoch.status !== "cancelled") throw new HttpError(409, `Epoch ${cancelled.epoch.n} ended ${cancelled.epoch.status} before it could be stopped`);
        const steer = putUserArtifact(rt, session.id, "Steer", { text: steerText, epoch: running.n, phase: running.phase } satisfies SteerData, start.id);
        let retry: Promise<unknown>;
        try { retry = rt.retryPhase(session.id); }
        catch (e) { throw new HttpError(409, (e as Error).message); }
        retry.then(() => rt.advance(session.id)).catch((e) => console.error(`steer retry failed in session ${session.id}: ${(e as Error).message}`));
        rememberSteer(rt, session.id, steer as Artifact<SteerData>, cancelled.taskIds[0] ?? null).catch((e) => console.error(`distillSteer failed in session ${session.id}: ${(e as Error).message}`));
        send(res, 202, { steerId: steer.id });
      } finally {
        steering.delete(session.id);
      }
    }],
  ];
}
