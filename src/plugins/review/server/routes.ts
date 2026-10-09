import { ConduitClient, readArcToken } from "../runtime/conduit.ts";
import { ImportRevisionError, importRevision } from "../runtime/import-revision.ts";
import { checkDrift } from "../runtime/drift.ts";
import { mappableSpecs } from "../tasks/map-spec-steps/task.ts";
import { commitRevision } from "../shared/phabricator.ts";
import { latestDiff, narrativeOf, sessionRefs } from "../shared/diffs.ts";
import { currentUserComments, postableComments } from "../shared/postable-comments.ts";
import { postPlan, type RevisionDrafts } from "../shared/post-plan.ts";
import { updateRevision } from "../workflow/update-revision.ts";
import type { ChangeReviewData, FindingDecisionData, ReviewCommentData, ReviewDraftData, ReviewPostedCommentData, ReviewSubmissionData, UserCommentData } from "../shared/types.ts";
import type { PostedCommentData } from "../../../plugin-api.ts";
import { createSession, HttpError, PhaseBusyError, readJson, requireArtifact, requireSession, runWorkflow, send, str, type Artifact, type DiffData, type LlmSelection, type PatchNarrativeData, type Runtime, type Route, putUserArtifact } from "../../../plugin-api.ts";

const HEAVY_TASKS = new Set(["importDiff", "importRevision", "narrate", "resolveSpecRefs", "review", "interdiff", "carryFindings"]);
const runningUpdates = new Set<string>();

export function reviewRoutes(rt: Runtime): Route[] {
  const requireNarratable = (id: string) => {
    const artifacts = rt.store.listArtifacts(id);
    const latest = latestDiff(artifacts);
    if (latest && narrativeOf(artifacts, latest.id)) throw new HttpError(409, "Session already has a narrative");
    if (rt.store.listTasks(id).some((task) => HEAVY_TASKS.has(task.kind) &&
      (task.status === "pending" || task.status === "running"))) {
      throw new HttpError(409, "Narration already running");
    }
    return latest;
  };
  return [
    ["POST", /^\/api\/sessions$/, async ({ req, res }) => {
      const body = await readJson(req);
      try {
        send(res, 201, await createSession(rt.store, str(body.repo, "repo"), str(body.title, "title"), "review"));
      } catch (e) {
        throw e instanceof HttpError ? e : new HttpError(400, (e as Error).message);
      }
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/findings\/([^/]+)\/decide$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]);
      const findingId = params[1]!;
      const body = await readJson(req);
      if (body.decision !== "accepted" && body.decision !== "dismissed") throw new HttpError(400, "Invalid decision");
      requireArtifact(rt, session.id, findingId, "ReviewFinding", "finding");
      const artifact = putUserArtifact(rt, session.id, "FindingDecision", { finding: findingId, decision: body.decision } satisfies FindingDecisionData, findingId);
      if (body.decision === "accepted") {
        const { taskId, done } = rt.start(session.id, "comment", { findingId, llm: body.llm as LlmSelection | undefined });
        done.catch((e) => console.error(`comment ${taskId} failed: ${(e as Error).message}`));
      }
      send(res, 201, { artifactId: artifact.id });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/narratives\/([^/]+)\/changes\/([^/]+)\/reviewed$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]!);
      const narrative = requireArtifact(rt, session.id, params[1]!, "PatchNarrative", "narrative") as Artifact<PatchNarrativeData>;
      const change = params[2]!;
      if (!narrative.data.changes.some((item) => item.id === change)) throw new HttpError(404, `Unknown change: ${change}`);
      const body = await readJson(req);
      if (typeof body.reviewed !== "boolean") throw new HttpError(400, "Invalid reviewed");
      const artifact = putUserArtifact(rt, session.id, "ChangeReview", { narrative: narrative.id, change, reviewed: body.reviewed } satisfies ChangeReviewData, `${narrative.id}#${change}`);
      send(res, 201, { artifactId: artifact.id });
    }],
    ["PUT", /^\/api\/sessions\/([^/]+)\/findings\/([^/]+)\/comment$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]);
      const findingId = params[1]!;
      const body = await readJson(req);
      const text = str(body.body, "body");
      if (!text.trim()) throw new HttpError(400, "Comment body must not be blank");
      requireArtifact(rt, session.id, findingId, "ReviewFinding", "finding");
      const artifact = putUserArtifact(rt, session.id, "ReviewComment", { finding: findingId, body: text } satisfies ReviewCommentData, findingId);
      send(res, 201, { artifactId: artifact.id });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/comments$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]!);
      const body = await readJson(req);
      const diffId = str(body.diffId, "diffId");
      const diffArtifact = requireArtifact(rt, session.id, diffId, "Diff", "diff") as Artifact<DiffData>;
      if (!body.lines || typeof body.lines !== "object") throw new HttpError(400, "Invalid lines");
      const lines = body.lines as Record<string, unknown>;
      if (typeof lines.path !== "string" || !diffArtifact.data.files.some((file) => file.path === lines.path)) throw new HttpError(400, "Comment path is outside the Diff");
      if (lines.side !== "new" && lines.side !== "old") throw new HttpError(400, "Invalid line side");
      if (!Number.isInteger(lines.start) || !Number.isInteger(lines.end) || (lines.start as number) < 1 || (lines.end as number) < 1) throw new HttpError(400, "Invalid line range");
      if ((lines.end as number) < (lines.start as number)) throw new HttpError(400, "Comment end must not precede start");
      const start = lines.start as number, end = lines.end as number;
      const text = str(body.body, "body");
      if (!text.trim()) throw new HttpError(400, "Comment body must not be blank");
      const artifact = putUserArtifact(rt, session.id, "UserComment", { diffId, lines: { path: lines.path, side: lines.side, start, end }, body: text, replaces: null, deleted: false } satisfies UserCommentData, diffId);
      send(res, 201, { artifactId: artifact.id });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/comments\/([^/]+)$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]!);
      const stableId = params[1]!;
      const artifacts = rt.store.listArtifacts(session.id);
      const current = currentUserComments(artifacts).find((comment) => (comment.data.replaces ?? comment.id) === stableId);
      if (!current) throw new HttpError(404, "Unknown comment");
      const posted = artifacts.some((artifact) => artifact.type === "PostedComment" && (artifact.data as PostedCommentData).comment === stableId);
      if (posted) throw new HttpError(409, "Comment was already posted");
      const body = await readJson(req);
      let data: UserCommentData;
      if (body.deleted === true && body.body === undefined) data = { ...current.data, body: "", replaces: stableId, deleted: true };
      else {
        const text = str(body.body, "body");
        if (!text.trim()) throw new HttpError(400, "Comment body must not be blank");
        data = { ...current.data, body: text, replaces: stableId, deleted: false };
      }
      const artifact = putUserArtifact(rt, session.id, "UserComment", data, stableId);
      send(res, 201, { artifactId: artifact.id });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/review-draft$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]!);
      const body = await readJson(req);
      if (!Number.isInteger(body.revision) || (body.revision as number) < 1) throw new HttpError(400, "Invalid revision");
      const revision = body.revision as number;
      const text = str(body.body, "body");
      const diff = latestDiff(rt.store.listArtifacts(session.id));
      if (!diff) throw new HttpError(409, "Session has no imported diff");
      const artifact = putUserArtifact(rt, session.id, "ReviewDraft", { revision, body: text } satisfies ReviewDraftData, diff.id);
      send(res, 201, { artifactId: artifact.id });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/findings\/([^/]+)\/comment\/regenerate$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]);
      const findingId = params[1]!;
      requireArtifact(rt, session.id, findingId, "ReviewFinding", "finding");
      const links = rt.store.listLinks(session.id);
      const decision = rt.store.listArtifacts(session.id, "FindingDecision").filter((artifact) =>
        links.some((link) => link.from === artifact.id && link.to === findingId && link.kind === "about"),
      ).at(-1);
      if (!decision || (decision.data as FindingDecisionData).decision !== "accepted") throw new HttpError(409, "Finding is not accepted");
      const body = await readJson(req);
      const { taskId, done } = rt.start(session.id, "comment", { findingId, llm: body.llm as LlmSelection | undefined });
      done.catch((e) => console.error(`comment ${taskId} failed: ${(e as Error).message}`));
      send(res, 202, { taskId });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/specs\/([^/]+)\/map$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]);
      const specId = params[1]!;
      const artifacts = rt.store.listArtifacts(session.id);
      const diff = latestDiff(artifacts);
      const narrative = diff && narrativeOf(artifacts, diff.id);
      if (!narrative) throw new HttpError(409, "Session has no narrative");
      if (!mappableSpecs({ artifacts, links: rt.store.listLinks(session.id) }, narrative.id).includes(specId)) throw new HttpError(409, "Spec has no steps to map onto this narrative's changes");
      const body = await readJson(req);
      const { taskId, done } = rt.start(session.id, "mapSpecSteps", { narrativeId: narrative.id, specId, llm: body.llm as LlmSelection | undefined });
      done.catch((e) => console.error(`mapSpecSteps ${taskId} failed: ${(e as Error).message}`));
      send(res, 202, { taskId });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/review-submit$/, async ({ req, params, res }) => {
      const session = requireSession(rt, params[0]!);
      const request = await readJson(req);
      const { revision, action, body } = request as { revision?: unknown; action?: unknown; body?: unknown };
      if (!Number.isInteger(revision) || (revision as number) <= 0) throw new HttpError(400, "revision must be a positive integer");
      const revisionId = revision as number;
      if (action !== "comment" && action !== "accept" && action !== "request-changes") throw new HttpError(400, "Invalid review action");
      if (typeof body !== "string") throw new HttpError(400, "body must be a string");
      const artifacts = rt.store.listArtifacts(session.id);
      const diffArtifact = latestDiff(artifacts);
      if (!diffArtifact) throw new HttpError(409, "Session has no imported diff");
      const diff = diffArtifact.data;
      const commit = diff.commits.findIndex((item) => commitRevision(item)?.id === revisionId);
      if (commit === -1) throw new HttpError(409, `No commit of the stack is D${revisionId}`);
      // Without a narrative there are no findings and no anchored comments yet; a general comment can still be submitted.
      const narrative = narrativeOf(artifacts, diffArtifact.id);
      const candidates = postableComments({ artifacts, links: rt.store.listLinks(session.id) }, narrative?.id ?? null);
      const plan = postPlan(diff, candidates);
      const group: RevisionDrafts = plan.revisions.find((item) => item.revision.id === revisionId) ?? {
        commit,
        revision: commitRevision(diff.commits[commit]!)!,
        items: [],
      };
      if (!group.items.length && action === "comment" && !body.trim()) throw new HttpError(400, "Nothing to submit");
      const loaded: { group: typeof plan.revisions[number]; conduit: ConduitClient; diffID: number }[] = [];
      const fetchRevision = async (host: string, id: number) => {
        let token: string;
        try { token = readArcToken(host); }
        catch (e) { throw new HttpError(409, (e as Error).message); }
        const conduit = new ConduitClient(process.env.SPATIAL_CONDUIT_BASE_URL ?? host, token);
        try {
          const revisionResult = await conduit.call<{ data: { phid: string }[] }>("differential.revision.search", { constraints: { ids: [id] } });
          const revision = revisionResult.data[0];
          if (!revision) throw new HttpError(502, `D${id} not found`);
          const diffResult = await conduit.call<{ data: { id: number }[] }>("differential.diff.search", { constraints: { revisionPHIDs: [revision.phid] }, order: "newest", limit: 1 });
          const latestDiff = diffResult.data[0];
          if (!latestDiff) throw new HttpError(502, `No diffs found on D${id}`);
          const remote = await conduit.call<string>("differential.getrawdiff", { diffID: latestDiff.id });
          return { conduit, diffID: latestDiff.id, remote };
        } catch (e) {
          if (e instanceof HttpError) throw e;
          throw new HttpError(502, (e as Error).message);
        }
      };
      {
        const { host, id } = group.revision;
        const { conduit, diffID, remote } = await fetchRevision(host, id);
        loaded.push({ group, conduit, diffID });
        const commit = diff.commits[group.commit]!;
        const parentSha = diff.commits[group.commit - 1]?.sha ?? diff.baseSha;
        const local = await rt.gitFor(session.id).diff(parentSha, commit.sha);
        const drift = checkDrift(local, remote);
        if (drift !== null) throw new HttpError(409, `Local patch differs from the latest diff on D${id} (first difference in ${drift}); update the revision or the checkout first`);
      }

      const skipped = plan.skipped.map(({ source, reason }) => ({ source, reason }));
      let postedCount = 0;
      for (const { group, conduit, diffID } of loaded) {
        for (const { source, commentId, body, target } of group.items) {
          let result: { id: number };
          try {
            result = await conduit.call<{ id: number }>("differential.createinline", {
              revisionID: group.revision.id,
              diffID,
              filePath: target.path,
              isNewFile: target.side === "new" ? 1 : 0,
              lineNumber: target.start,
              lineLength: target.end - target.start,
              content: body,
            });
          } catch (e) {
            throw new HttpError(502, (e as Error).message);
          }
          const artifact = rt.store.putArtifact({
            sessionId: session.id,
            type: "PostedComment",
            status: "verified",
            data: { comment: commentId, source: source.id, revision: group.revision.id, diff: diffID, inlineId: result.id } satisfies ReviewPostedCommentData,
            provenance: { taskId: "runtime" },
          });
          const link = rt.store.putLink({ sessionId: session.id, from: artifact.id, to: commentId, kind: "about" });
          rt.emit(session.id, "runtime", "artifact.created", { artifactId: artifact.id, type: artifact.type });
          rt.emit(session.id, "runtime", "link.created", { linkId: link.id, from: artifact.id, to: commentId, kind: "about" });
          postedCount++;
        }
      }
      const { conduit } = loaded[0]!;
      try {
        await conduit.call("differential.createcomment", {
          revision_id: revisionId,
          message: body,
          action: action === "accept" ? "accept" : action === "request-changes" ? "reject" : "none",
          attach_inlines: true,
        });
      } catch (e) {
        throw new HttpError(502, (e as Error).message);
      }
      rt.store.putArtifact({
        sessionId: session.id,
        type: "ReviewSubmission",
        status: "verified",
        data: { revision: revisionId, action, body, inlines: postedCount } satisfies ReviewSubmissionData,
        provenance: { taskId: "runtime" },
      });
      send(res, 200, { inlines: postedCount, skipped, revision: `D${revisionId}` });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/update$/, async ({ req, params, res }) => {
      const id = requireSession(rt, params[0]!).id;
      const body = await readJson(req);
      const llm = body.llm as LlmSelection | undefined;
      const artifacts = rt.store.listArtifacts(id);
      const tasks = rt.store.listTasks(id);
      const prev = latestDiff(artifacts);
      if (!prev) throw new HttpError(409, "Session has no imported diff");
      const refs = sessionRefs(artifacts, tasks);
      if (!refs) throw new HttpError(409, "Cannot find the refs of the session");
      if (tasks.some((task) => HEAVY_TASKS.has(task.kind) && (task.status === "pending" || task.status === "running"))) {
        throw new HttpError(409, "A task is already running");
      }
      let head: string;
      try { head = await rt.gitFor(id).resolve(refs.head); }
      catch (e) { throw new HttpError(409, (e as Error).message); }
      if (head === prev.data.headSha) throw new HttpError(409, "No new revision");
      // Checked after the last await: the chain has gaps between tasks that the HEAVY_TASKS check does not see.
      if (runningUpdates.has(id)) throw new HttpError(409, "An update is already running");
      runningUpdates.add(id);
      updateRevision(rt, id, llm)
        .catch((e) => console.error(`update failed in session ${id}: ${(e as Error).message}`))
        .finally(() => runningUpdates.delete(id));
      send(res, 202, {});
    }],
    ["GET", /^\/api\/sessions\/([^/]+)\/diffs\/([^/]+)\/file$/, async ({ params, url }) => {
      const id = requireSession(rt, params[0]).id;
      let diff;
      try {
        diff = rt.store.getArtifact<DiffData>(params[1]);
      } catch {
        throw new HttpError(404, "Unknown diff");
      }
      if (diff.sessionId !== id || diff.type !== "Diff") throw new HttpError(404, "Unknown diff");
      const path = url.searchParams.get("path");
      const file = diff.data.files.find((entry) => entry.path === path);
      if (!file) throw new HttpError(404, "Unknown file");
      if ((file.status !== "modified" && file.status !== "renamed") || file.binary) {
        throw new HttpError(400, "Context is only available for modified or renamed text files");
      }
      const text = await rt.gitFor(id).show(diff.data.headSha, file.path);
      const lines = text.split("\n");
      if (text.endsWith("\n")) lines.pop();
      return { lines };
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/narrate$/, async ({ req, res, params }) => {
      const id = requireSession(rt, params[0]).id;
      const body = await readJson(req);
      const llm = body.llm as LlmSelection | undefined;
      if (body.base === undefined && body.head === undefined) {
        const latest = requireNarratable(id);
        const epoch = rt.store.listEpochs(id).at(-1);
        if (epoch && (epoch.status === "failed" || epoch.status === "cancelled")) {
          let retry: Promise<unknown>;
          try { retry = rt.retryPhase(id); }
          catch (e) { if (e instanceof PhaseBusyError) throw new HttpError(409, e.message); throw e; }
          retry.then(() => rt.advance(id)).catch((e) => console.error(`phase retry failed in session ${id}: ${(e as Error).message}`));
          send(res, 202, {});
          return;
        }
        if (latest) {
          let work: Promise<unknown>;
          try { work = rt.runPhase(id, "review", { base: latest.data.baseSha, head: latest.data.headSha, update: false, diffId: latest.id, llm }); }
          catch (e) { if (e instanceof PhaseBusyError) throw new HttpError(409, e.message); throw e; }
          work.catch((e) => console.error(`narrate failed in session ${id}: ${(e as Error).message}`));
          send(res, 202, {});
          return;
        } else {
          const start = rt.store.listArtifacts(id, "WorkflowStart").at(-1);
          if (!start) throw new HttpError(400, "Missing string field: base");
          runWorkflow(rt, id, start.id, llm).catch((e) => console.error(`workflow retry failed in session ${id}: ${(e as Error).message}`));
          send(res, 202, {});
          return;
        }
      } else if (body.base === undefined) {
        throw new HttpError(400, "Missing string field: base");
      } else if (body.head === undefined) {
        throw new HttpError(400, "Missing string field: head");
      } else {
        requireNarratable(id);
        const base = str(body.base, "base"), head = str(body.head, "head");
        let work: Promise<unknown>;
        try { work = rt.runPhase(id, "review", { base, head, update: false, llm }); }
        catch (e) { if (e instanceof PhaseBusyError) throw new HttpError(409, e.message); throw e; }
        work.catch((e) => console.error(`narrate failed in session ${id}: ${(e as Error).message}`));
        send(res, 202, {});
        return;
      }
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/import-revision$/, async ({ req, res, params }) => {
      const id = requireSession(rt, params[0]!).id;
      const body = await readJson(req);
      const host = str(body.host, "host");
      if (!Number.isInteger(body.id) || (body.id as number) < 1) throw new HttpError(400, "Missing integer field: id");
      if (requireNarratable(id)) throw new HttpError(409, "Session already has an imported diff");
      let range: { base: string; head: string };
      try {
        range = await importRevision(rt, id, { host, id: body.id as number });
      } catch (e) {
        if (!(e instanceof ImportRevisionError)) throw e;
        throw new HttpError(e.kind === "remote" ? 502 : 409, e.message);
      }
      if (requireNarratable(id)) throw new HttpError(409, "Session already has an imported diff");
      let work: Promise<unknown>;
      try { work = rt.runPhase(id, "review", { ...range, update: false, llm: body.llm as LlmSelection | undefined }); }
      catch (e) { if (e instanceof PhaseBusyError) throw new HttpError(409, e.message); throw e; }
      work.catch((e) => console.error(`remote review failed in session ${id}: ${(e as Error).message}`));
      send(res, 202, range);
    }]
  ];
}
