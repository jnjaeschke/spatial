import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, isAbsolute, join, normalize, sep } from "node:path";
import type { SelectorQuestionData, SelectorAnswerData, Artifact, ChangeReviewData, DiffData, DirectoryListing, FindingDecisionData, HealthResponse, LlmSelection, McpServerData, ModelsResponse, NoteData, PatchNarrativeData, PostedCommentData, RecentRepo, RepoInfo, ReviewCommentData, ReviewFindingData, Session, WorkflowInfo } from "../shared/types.ts";
import { createSession, resolveRepo } from "../runtime/git.ts";
import { ConduitClient, readArcToken } from "../runtime/conduit.ts";
import { checkDrift } from "../runtime/drift.ts";
import { postableComments } from "../shared/postable-comments.ts";
import { postPlan } from "../shared/post-plan.ts";
import { buildSessionState } from "../runtime/state.ts";
import { PhaseBusyError, type Runtime } from "../runtime/tasks.ts";
import { loadRepoContext } from "../runtime/repo-context.ts";
import { commitRevision } from "../shared/phabricator.ts";
import { latestDiff, narrativeOf, sessionRefs } from "../shared/diffs.ts";
import { groupByRepo, newestFirst, repoName } from "../shared/repos.ts";
import { updateRevision } from "../workflows/update-revision.ts";
import { workflowInfo } from "../workflows/registry.ts";
import { continueSelection, runWorkflow, startSession } from "../workflows/start.ts";
import { importRevision, ImportRevisionError } from "../runtime/import-revision.ts";
import { mappableSpecs } from "../tasks/map-spec-steps/task.ts";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2",
};
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1"]);
const HEAVY_TASKS = new Set(["importDiff", "importRevision", "narrate", "resolveSpecRefs", "review", "interdiff", "carryFindings"]);
const runningUpdates = new Set<string>();

export type HttpRouteContext = { req: IncomingMessage; res: ServerResponse; params: string[]; url: URL };
export type Route = [method: string, pattern: RegExp, handler: (c: HttpRouteContext) => Promise<unknown>];

export function send(res: ServerResponse, status: number, body?: unknown) {
  if (body === undefined) res.writeHead(status).end();
  else res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new HttpError(413, "Body too large");
  }
  try {
    const v: unknown = JSON.parse(raw || "{}");
    if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Body must be a JSON object");
  }
}

export const str = (v: unknown, name: string): string => {
  if (typeof v !== "string" || v === "") throw new HttpError(400, `Missing string field: ${name}`);
  return v;
};

export function requireSession(rt: Runtime, id: string) {
  try {
    return rt.store.getSession(id);
  } catch {
    throw new HttpError(404, `Unknown session: ${id}`);
  }
}

export function requireArtifact(rt: Runtime, sessionId: string, id: string, type: string, label: string) {
  let artifact;
  try { artifact = rt.store.getArtifact(id); }
  catch { throw new HttpError(404, `Unknown ${label}: ${id}`); }
  if (artifact.sessionId !== sessionId || artifact.type !== type) throw new HttpError(404, `Unknown ${label}: ${id}`);
  return artifact;
}

export function putUserArtifact(rt: Runtime, sessionId: string, type: string, data: unknown, about: string) {
  const artifact = rt.store.putArtifact({
    sessionId,
    type,
    status: "verified",
    data,
    provenance: { taskId: "user" },
  });
  const link = rt.store.putLink({ sessionId, from: artifact.id, to: about, kind: "about" });
  rt.emit(sessionId, "user", "artifact.created", { artifactId: artifact.id, type: artifact.type });
  rt.emit(sessionId, "user", "link.created", { linkId: link.id, from: artifact.id, to: about, kind: "about" });
  return artifact;
}

export function createHttpServer(rt: Runtime, opts: { staticDir?: string; background?: { intervalMs?: number }; pid?: number; commit?: string | null; homeDir?: string } = {}): Server {
  const pluginServers = rt.plugins.plugins.flatMap((plugin) => plugin.server ? [plugin.server(rt, { intervalMs: opts.background?.intervalMs })] : []);
  if (opts.background) for (const plugin of pluginServers) plugin.start?.();
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
  const routes: Route[] = [
    ["GET", /^\/api\/health$/, async (): Promise<HealthResponse> => ({
      app: "spatial-ide", ui: opts.staticDir !== undefined, pid: opts.pid ?? process.pid, commit: opts.commit ?? null,
      runningTasks: rt.store.listSessions().flatMap((session) => rt.store.listTasks(session.id)).filter((task) => task.status === "running").length,
    })],
    ["GET", /^\/api\/workflows$/, async (): Promise<WorkflowInfo[]> => workflowInfo(rt.workflows.values())],
    ["POST", /^\/api\/start$/, async ({ req, res }) => {
      const body = await readJson(req);
      const path = str(body.path, "path");
      if (!isAbsolute(path)) throw new HttpError(400, "path must be absolute");
      const text = str(body.text, "text");
      let session: Session;
      try { session = await startSession(rt, path, text, body.llm as LlmSelection | undefined); }
      catch (e) { throw new HttpError(400, (e as Error).message); }
      send(res, 201, session);
    }],
    ["GET", /^\/api\/repo$/, async ({ url }): Promise<RepoInfo> => {
      const path = url.searchParams.get("path");
      if (!path || !isAbsolute(path)) throw new HttpError(400, "Query parameter path must be an absolute path");
      let repo: { worktree: string; repoDir: string };
      try { repo = await resolveRepo(path); }
      catch (e) { throw new HttpError(400, (e as Error).message); }
      return { ...repo, name: repoName(repo.repoDir), sessions: newestFirst(rt.store.listSessions().filter((s) => s.repoDir === repo.repoDir)) };
    }],
    ["GET", /^\/api\/dirs$/, async ({ url }): Promise<DirectoryListing> => {
      const requested = url.searchParams.get("path");
      const path = requested ?? opts.homeDir ?? homedir();
      if (!isAbsolute(path)) throw new HttpError(400, "Query parameter path must be an absolute path");
      let info;
      try { info = await stat(path); }
      catch (e) { const error = e as NodeJS.ErrnoException; throw new HttpError(error.code === "ENOENT" ? 404 : 400, error.message); }
      if (!info.isDirectory()) throw new HttpError(400, "Path is not a directory");
      let children;
      try { children = await readdir(path, { withFileTypes: true }); }
      catch (e) { throw new HttpError(400, (e as Error).message); }
      const entries: DirectoryListing["entries"] = [];
      for (const child of children) {
        if (child.name.startsWith(".")) continue;
        const childPath = join(path, child.name);
        try {
          if (!(child.isDirectory() || child.isSymbolicLink() && (await stat(childPath)).isDirectory())) continue;
        } catch { continue; }
        let repo = false;
        try { await stat(join(childPath, ".git")); repo = true; } catch { /* Not a git root. */ }
        entries.push({ name: child.name, path: childPath, repo });
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      const truncated = entries.length > 2000;
      return { path, parent: dirname(path) === path ? null : dirname(path), entries: entries.slice(0, 2000), ...(truncated ? { truncated: true as const } : {}) };
    }],
    ["GET", /^\/api\/sessions$/, async () => rt.store.listSessions()],
    ["GET", /^\/api\/repos$/, async (): Promise<RecentRepo[]> => {
      const result: RecentRepo[] = [];
      const resolved = new Map<string, ReturnType<typeof resolveRepo>>();
      for (const group of groupByRepo(rt.store.listSessions())) {
        const byWorktree = new Map<string, RecentRepo>();
        for (const session of group.sessions) {
          let worktree: string;
          try {
            if (!resolved.has(session.worktree)) resolved.set(session.worktree, resolveRepo(session.worktree));
            const repo = await resolved.get(session.worktree)!;
            if (repo.repoDir !== group.repoDir) continue;
            worktree = repo.worktree;
          } catch {
            continue; // A stale worktree; the repository's other checkouts may still be live.
          }
          const known = byWorktree.get(worktree);
          if (known) known.sessions++;
          else byWorktree.set(worktree, { repoDir: group.repoDir, name: group.name, worktree, sessions: 1, lastActive: session.createdAt });
        }
        result.push(...byWorktree.values());
      }
      return result;
    }],
    ["POST", /^\/api\/sessions$/, async ({ req, res }) => {
      const body = await readJson(req);
      try {
        send(res, 201, await createSession(rt.store, str(body.repo, "repo"), str(body.title, "title"), "review"));
      } catch (e) {
        throw e instanceof HttpError ? e : new HttpError(400, (e as Error).message);
      }
    }],
    ["GET", /^\/api\/sessions\/([^/]+)\/state$/, async ({ params }) => {
      requireSession(rt, params[0]);
      return await buildSessionState(rt.store, rt.searchfox, params[0]);
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/threads\/([^/]+)\/enable-mcp-server$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]);
      const threadId = params[1]!;
      const body = await readJson(req);
      const server = str(body.server, "server");
      requireArtifact(rt, session.id, threadId, "ChatThread", "thread");
      if (!loadRepoContext(session.worktree).requestableMcpServers[server]) throw new HttpError(400, `Not an on-request MCP server: ${server}`);
      const artifact = putUserArtifact(rt, session.id, "McpServerEnabled", { server } satisfies McpServerData, threadId);
      send(res, 201, { artifactId: artifact.id });
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
    ["POST", /^\/api\/sessions\/([^/]+)\/post-drafts$/, async ({ params, res }) => {
      const session = requireSession(rt, params[0]!);
      const artifacts = rt.store.listArtifacts(session.id);
      const diffArtifact = latestDiff(artifacts);
      if (!diffArtifact) throw new HttpError(409, "Session has no imported diff");
      const diff = diffArtifact.data;
      if (!diff.commits.some((commit) => commitRevision(commit) !== null)) {
        throw new HttpError(409, "No commit of the stack has a Differential Revision trailer");
      }
      const narrative = narrativeOf(artifacts, diffArtifact.id);
      if (!narrative) throw new HttpError(409, "The latest revision has no narrative");
      const candidates = postableComments({ artifacts, links: rt.store.listLinks(session.id) }, narrative.id);
      const plan = postPlan(diff, candidates);
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
      for (const group of plan.revisions) {
        const { host, id } = group.revision;
        const { conduit, diffID, remote } = await fetchRevision(host, id);
        loaded.push({ group, conduit, diffID });
        const commit = diff.commits[group.commit]!;
        const parentSha = diff.commits[group.commit - 1]?.sha ?? diff.baseSha;
        const local = await rt.gitFor(session.id).diff(parentSha, commit.sha);
        const drift = checkDrift(local, remote);
        if (drift !== null) throw new HttpError(409, `Local patch differs from the latest diff on D${id} (first difference in ${drift}); update the revision or the checkout first`);
      }

      const skipped = plan.skipped.map(({ finding, reason }) => ({ finding, reason }));
      let postedCount = 0;
      for (const { group, conduit, diffID } of loaded) {
        for (const { finding, comment, target } of group.items) {
          let result: { id: number };
          try {
            result = await conduit.call<{ id: number }>("differential.createinline", {
              revisionID: group.revision.id,
              diffID,
              filePath: target.path,
              isNewFile: target.side === "new" ? 1 : 0,
              lineNumber: target.start,
              lineLength: target.end - target.start,
              content: comment.data.body,
            });
          } catch (e) {
            throw new HttpError(502, (e as Error).message);
          }
          const artifact = rt.store.putArtifact({
            sessionId: session.id,
            type: "PostedComment",
            status: "verified",
            data: { comment: comment.id, revision: group.revision.id, diff: diffID, inlineId: result.id } satisfies PostedCommentData,
            provenance: { taskId: "runtime" },
          });
          const link = rt.store.putLink({ sessionId: session.id, from: artifact.id, to: comment.id, kind: "about" });
          rt.emit(session.id, "runtime", "artifact.created", { artifactId: artifact.id, type: artifact.type });
          rt.emit(session.id, "runtime", "link.created", { linkId: link.id, from: artifact.id, to: comment.id, kind: "about" });
          postedCount++;
        }
      }
      send(res, 200, { posted: postedCount, skipped, revision: loaded.map(({ group }) => `D${group.revision.id}`).join(", ") });
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
    ["GET", /^\/api\/sessions\/([^/]+)\/events$/, async ({ req, res, params, url }) => {
      const id = requireSession(rt, params[0]).id;
      const headerId = req.headers["last-event-id"];
      const after = Number(headerId ?? url.searchParams.get("after") ?? 0);
      if (!Number.isSafeInteger(after) || after < 0) throw new HttpError(400, "Invalid event id");
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      const unwatch = pluginServers.map((plugin) => plugin.watch?.(id)).filter((stop): stop is () => void => !!stop);
      const write = (e: { id: number }) => res.write(`id: ${e.id}\nevent: runtime\ndata: ${JSON.stringify(e)}\n\n`);
      for (const e of rt.store.listEvents(id, after)) write(e);
      const off = rt.onEvent((e) => { if (e.sessionId === id) write(e); });
      const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
      res.on("close", () => { off(); clearInterval(ping); for (const stop of unwatch) stop(); });
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
          retry.catch((e) => console.error(`phase retry failed in session ${id}: ${(e as Error).message}`));
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
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/selector-answer$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]);
      const body = await readJson(req);
      const text = str(body.text, "text").trim();
      if (!text) throw new HttpError(400, "Answer must not be empty");
      if (session.workflow) throw new HttpError(409, "Session already has a workflow");
      const artifacts = rt.store.listArtifacts(session.id);
      const question = artifacts.findLast((artifact) => artifact.type === "SelectorQuestion") as Artifact<SelectorQuestionData> | undefined;
      if (!question) throw new HttpError(409, "No open selector question");
      if (artifacts.some((artifact) => artifact.type === "SelectorAnswer" && (artifact.data as SelectorAnswerData).question === question.id)) throw new HttpError(409, "Question already answered");
      const answer = putUserArtifact(rt, session.id, "SelectorAnswer", { question: question.id, text } satisfies SelectorAnswerData, question.id);
      continueSelection(rt, session.id, question, text, body.llm as LlmSelection | undefined);
      send(res, 201, { artifactId: answer.id });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/notes$/, async ({ req, res, params }) => {
      const id = requireSession(rt, params[0]).id;
      const body = await readJson(req);
      if (typeof body.body !== "string" || !body.body.trim()) throw new HttpError(400, "Note body must not be empty");
      const start = rt.store.listArtifacts(id).findLast((artifact) => artifact.type === "WorkflowStart");
      if (!start) throw new HttpError(400, "Session has no start request");
      const note = putUserArtifact(rt, id, "Note", { body: body.body.trim() } satisfies NoteData, start.id);
      send(res, 201, { artifactId: note.id });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/turns$/, async ({ req, res, params }) => {
      const id = requireSession(rt, params[0]).id;
      const body = await readJson(req);
      const text = str(body.text, "text");
      if (typeof body.llm !== "object" || body.llm === null) throw new HttpError(400, "Missing field: llm");
      if (body.quote !== undefined && (typeof body.quote !== "string" || body.quote.length > 20_000)) throw new HttpError(400, "Invalid quote");
      if (body.lines !== undefined) {
        const lines = body.lines as Record<string, unknown>;
        if (typeof lines !== "object" || lines === null || typeof lines.path !== "string" ||
          (lines.side !== "old" && lines.side !== "new") || !Number.isInteger(lines.start) || !Number.isInteger(lines.end) ||
          (lines.start as number) < 1 || (lines.end as number) < (lines.start as number)) throw new HttpError(400, "Invalid lines");
      }
      const threadId = body.threadId as string | undefined;
      if (body.aside !== undefined && typeof body.aside !== "boolean") throw new HttpError(400, "Invalid aside");
      if (body.aside !== undefined && body.anchor === undefined) throw new HttpError(400, "aside requires anchor");
      if (body.threadId !== undefined && body.aside !== undefined) throw new HttpError(400, "aside cannot be used with threadId");
      if (threadId && rt.store.listTasks(id).some((t) =>
        t.kind === "chatTurn" && (t.status === "running" || t.status === "pending") && (t.input as { threadId?: string }).threadId === threadId)) {
        throw new HttpError(409, "A turn is already running in this thread");
      }
      const { taskId, done } = rt.start(id, "chatTurn", { threadId, anchor: body.anchor as string | undefined, aside: body.aside as boolean | undefined, text, llm: body.llm, quote: body.quote, lines: body.lines });
      done.catch((e) => console.error(`chatTurn ${taskId} failed: ${(e as Error).message}`));
      send(res, 202, { taskId });
    }],
    ["GET", /^\/api\/llm\/models$/, async (): Promise<ModelsResponse> => ({
      default: rt.llm.defaultSelection,
      backends: await rt.llm.listModels(),
    })],
    ["POST", /^\/api\/tasks\/([^/]+)\/cancel$/, async ({ res, params }) => {
      try { rt.cancel(params[0]); }
      catch (e) { throw new HttpError(409, (e as Error).message); }
      send(res, 204);
    }],
  ];
  routes.push(...pluginServers.flatMap((plugin) => plugin.routes ?? []));

  async function serveStatic(res: ServerResponse, pathname: string) {
    if (!opts.staticDir) throw new HttpError(404, "Not found");
    const root = normalize(opts.staticDir + sep);
    let decoded: string;
    try { decoded = decodeURIComponent(pathname); }
    catch { throw new HttpError(400, "Invalid path encoding"); }
    const file = normalize(join(root, decoded));
    const target = file.startsWith(root) && extname(file) ? file : join(root, "index.html");
    let data: Buffer;
    try { data = await readFile(target); }
    catch {
      data = await readFile(join(root, "index.html"));
      res.writeHead(200, { "content-type": MIME[".html"] }).end(data);
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(target)] ?? "application/octet-stream" }).end(data);
  }

  return createServer(async (req, res) => {
    try {
      const host = (req.headers.host ?? "").replace(/:\d+$/, "").toLowerCase();
      if (!ALLOWED_HOSTS.has(host)) throw new HttpError(403, "Forbidden host");
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "POST" && !(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
        throw new HttpError(415, "POST requires application/json");
      }
      for (const [method, pattern, handler] of routes) {
        const match = pattern.exec(url.pathname);
        if (match && req.method === method) {
          const out = await handler({ req, res, params: match.slice(1), url });
          if (!res.headersSent) send(res, 200, out);
          return;
        }
      }
      if (url.pathname.startsWith("/api/")) throw new HttpError(404, `No route: ${req.method} ${url.pathname}`);
      if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
      await serveStatic(res, url.pathname);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) send(res, status, { error: (e as Error).message });
      else res.end();
    }
  });
}
