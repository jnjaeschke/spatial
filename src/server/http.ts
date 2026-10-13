import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, isAbsolute, join, normalize, sep } from "node:path";
import type { Artifact, ChatMessageData, DecisionData, DirectoryListing, HealthResponse, LlmSelection, McpServerData, ModelsResponse, NoteData, NotifyPayload, RecentRepo, RepoInfo, Session, SessionListing, StartQuestion, TaskActivityResponse, UsageRun, WorkflowInfo, WriteMode } from "../shared/types.ts";
import { resolveRepo } from "../runtime/git.ts";
import { buildSessionState } from "../runtime/state.ts";
import { BusyError, type Runtime } from "../runtime/tasks.ts";
import { workflowView } from "../runtime/render-ref.ts";
import { loadRepoContext } from "../runtime/repo-context.ts";
import { groupByRepo, recentFirst, repoName } from "../shared/repos.ts";
import { isActive } from "../shared/task-state.ts";
import { workflowInfo } from "../workflows/registry.ts";
import { startSession, type PendingStart, type StartRequest } from "../workflows/start.ts";
import { meteredRuns } from "../runtime/usage.ts";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** The status of the response to an error a route throws: an `HttpError`'s own, 409 for a `BusyError`, else 500. */
export const errorStatus = (e: unknown) => e instanceof HttpError ? e.status : e instanceof BusyError ? 409 : 500;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2",
};
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1"]);

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

/** A non-blank string field, returned as sent; `label` names it in the error. */
export const text = (body: Record<string, unknown>, name: string, label = name): string => {
  const value = str(body[name], name);
  if (!value.trim()) throw new HttpError(400, `${label} must not be blank`);
  return value;
};

/** The optional `llm` field: absent, or a `{ backend, model, effort }` selection. */
export function llmField(body: Record<string, unknown>): LlmSelection | undefined {
  if (body.llm === undefined) return undefined;
  const candidate = body.llm as Partial<LlmSelection> | null;
  if (typeof candidate !== "object" || candidate === null || (candidate.backend !== "claude" && candidate.backend !== "codex") || typeof candidate.model !== "string" || typeof candidate.effort !== "string") throw new HttpError(400, "llm must be { backend, model, effort }");
  return { backend: candidate.backend, model: candidate.model, effort: candidate.effort };
}

/** Starts a task in the background and logs its failure; returns the task id. */
export function startTask(rt: Runtime, sessionId: string, kind: string, input: unknown): string {
  const { taskId, done } = rt.start(sessionId, kind, input);
  done.catch((e) => console.error(`${kind} ${taskId} failed: ${(e as Error).message}`));
  return taskId;
}

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
  const artifact = rt.putArtifact("user", {
    sessionId,
    type,
    status: "verified",
    data,
    provenance: { taskId: "user" },
  });
  rt.putLink("user", { sessionId, from: artifact.id, to: about, kind: "about" });
  return artifact;
}

/** Stores the user's answer to an open `Decision` as a verified version linked `revises →` it. Throws `HttpError` for an unknown option, missing or malformed text, an answered or superseded decision, a running epoch, or an answer the workflow's `checkAnswer` refuses. */
function answerDecision(rt: Runtime, sessionId: string, open: Artifact<DecisionData>, optionId: string, text: unknown, llm: unknown): Artifact<DecisionData> {
  if (open.data.chosen) throw new HttpError(409, "Decision already answered");
  if (rt.store.listArtifacts(sessionId, "Decision").at(-1)?.id !== open.id) throw new HttpError(409, "Not the latest decision");
  const running = rt.runningEpoch(sessionId);
  if (running) throw new HttpError(409, `Epoch ${running.n} (${running.phase}) is running`);
  const option = open.data.options.find((candidate) => candidate.id === optionId);
  if (!option) throw new HttpError(400, `Unknown option: ${optionId}`);
  if (text !== undefined && typeof text !== "string") throw new HttpError(400, "text must be a string");
  const trimmed = (text ?? "").trim();
  if (trimmed && !option.takesText) throw new HttpError(400, `Option ${option.id} takes no text`);
  if (option.requiresText && !trimmed) throw new HttpError(400, `Option ${option.id} requires text`);
  if (trimmed && option.textPattern && !new RegExp(option.textPattern).test(trimmed)) throw new HttpError(400, `Text for ${option.id} must match ${option.textPattern}`);
  if (llm !== undefined && !option.takesModel) throw new HttpError(400, `Option ${option.id} takes no model`);
  const selection = llmField({ llm });
  const workflow = rt.store.getSession(sessionId).workflow;
  const refused = workflow ? rt.workflows.get(workflow)?.checkAnswer?.(workflowView(rt.store, sessionId), open, option.id) : null;
  if (refused) throw new HttpError(409, refused);
  const answered = rt.putArtifact<DecisionData>("user", { sessionId, type: "Decision", status: "verified", epoch: open.epoch, data: { ...open.data, chosen: { option: option.id, by: "user", ...(trimmed ? { text: trimmed } : {}), ...(selection ? { llm: selection } : {}) } }, provenance: { taskId: "user" } });
  rt.putLink("user", { sessionId, from: answered.id, to: open.id, kind: "revises" });
  return answered;
}

export function createHttpServer(rt: Runtime, opts: { staticDir?: string; background?: { intervalMs?: number }; pid?: number; commit?: string | null; homeDir?: string } = {}): Server {
  const pluginServers = rt.plugins.plugins.flatMap((plugin) => plugin.server ? [plugin.server(rt, { intervalMs: opts.background?.intervalMs })] : []);
  if (opts.background) for (const plugin of pluginServers) plugin.start?.();
  const pendingStarts = new Map<string, PendingStart>();
  const routes: Route[] = [
    ["GET", /^\/api\/health$/, async (): Promise<HealthResponse> => ({
      app: "spatial", ui: opts.staticDir !== undefined, pid: opts.pid ?? process.pid, commit: opts.commit ?? null,
      runningTasks: rt.store.listSessions().flatMap((session) => rt.store.listTasks(session.id)).filter((task) => task.status === "running").length,
    })],
    ["GET", /^\/api\/workflows$/, async (): Promise<WorkflowInfo[]> => workflowInfo(rt.workflows.values())],
    ["POST", /^\/api\/start$/, async ({ req, res }) => {
      const body = await readJson(req);
      let request: StartRequest;
      if (body.question !== undefined) {
        const answer = body.answer;
        if (!Number.isInteger(answer) && typeof answer !== "string") throw new HttpError(400, "Invalid answer");
        request = { question: str(body.question, "question"), answer: answer as number | string };
      } else {
        const path = str(body.path, "path");
        if (!isAbsolute(path)) throw new HttpError(400, "path must be absolute");
        const writeMode = body.writeMode;
        if (writeMode !== undefined && writeMode !== "auto" && writeMode !== "full" && writeMode !== "editsOnly") throw new HttpError(400, "Invalid writeMode");
        const llm = llmField(body);
        request = { path, text: str(body.text, "text"), ...(llm ? { llm } : {}), ...(writeMode ? { writeMode: writeMode as WriteMode } : {}) };
      }
      // The selector may run for a while; a start box that goes away cancels it.
      const abort = new AbortController();
      res.on("close", () => { if (!res.writableFinished) abort.abort(); });
      let result: Session | StartQuestion;
      try { result = await startSession(rt, pendingStarts, request, abort.signal); }
      catch (e) { throw new HttpError(400, (e as Error).message); }
      send(res, "question" in result ? 200 : 201, result);
    }],
    ["GET", /^\/api\/repo$/, async ({ url }): Promise<RepoInfo> => {
      const path = url.searchParams.get("path");
      if (!path || !isAbsolute(path)) throw new HttpError(400, "Query parameter path must be an absolute path");
      let repo: { worktree: string; repoDir: string };
      try { repo = await resolveRepo(path); }
      catch (e) { throw new HttpError(400, (e as Error).message); }
      return { ...repo, name: repoName(repo.repoDir), sessions: recentFirst(rt.store.listSessionListings().filter((s) => s.repoDir === repo.repoDir)) };
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
    ["GET", /^\/api\/sessions$/, async (): Promise<SessionListing[]> => rt.store.listSessionListings()],
    ["GET", /^\/api\/usage$/, async (): Promise<UsageRun[]> => meteredRuns(rt.store.listEventsOfType("llm.usage"))],
    ["GET", /^\/api\/repos$/, async (): Promise<RecentRepo[]> => {
      const result: RecentRepo[] = [];
      const live = new Map<string, Promise<boolean>>();
      for (const group of groupByRepo(rt.store.listSessionListings())) {
        const byWorktree = new Map<string, RecentRepo>();
        for (const session of group.sessions) {
          const { worktree } = session;
          // Sessions store the resolved checkout, so a .git entry (a file in linked worktrees) is enough; no git process per checkout.
          if (!live.has(worktree)) live.set(worktree, access(join(worktree, ".git")).then(() => true, () => false));
          if (!await live.get(worktree)) continue; // A stale worktree; the repository's other checkouts may still be live.
          const known = byWorktree.get(worktree);
          if (known) known.sessions++;
          else byWorktree.set(worktree, { repoDir: group.repoDir, name: group.name, worktree, sessions: 1, lastActive: session.lastActive });
        }
        result.push(...byWorktree.values());
      }
      return result;
    }],
    ["DELETE", /^\/api\/sessions\/([^/]+)$/, async ({ res, params }) => {
      requireSession(rt, params[0]);
      rt.deleteSession(params[0]!);
      send(res, 204);
    }],
    ["GET", /^\/api\/sessions\/([^/]+)\/state$/, async ({ params }) => {
      requireSession(rt, params[0]);
      return await buildSessionState(rt, params[0]);
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
    ["GET", /^\/api\/sessions\/([^/]+)\/tasks\/([^/]+)\/activity$/, async ({ params }): Promise<TaskActivityResponse> => {
      const id = requireSession(rt, params[0]).id;
      return { activity: rt.store.listTaskActivity(id, params[1]!), lastEventId: rt.store.lastEventId(id) };
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
    ["POST", /^\/api\/sessions\/([^/]+)\/notes$/, async ({ req, res, params }) => {
      const id = requireSession(rt, params[0]).id;
      const body = await readJson(req);
      if (typeof body.body !== "string" || !body.body.trim()) throw new HttpError(400, "Note body must not be empty");
      const start = rt.store.listArtifacts(id).findLast((artifact) => artifact.type === "WorkflowStart");
      if (!start) throw new HttpError(400, "Session has no start request");
      const note = putUserArtifact(rt, id, "Note", { body: body.body.trim() } satisfies NoteData, start.id);
      send(res, 201, { artifactId: note.id });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/decisions\/([^/]+)$/, async ({ req, res, params }) => {
      const id = requireSession(rt, params[0]).id;
      const open = requireArtifact(rt, id, params[1]!, "Decision", "decision") as Artifact<DecisionData>;
      const body = await readJson(req);
      const answered = answerDecision(rt, id, open, str(body.option, "option"), body.text, body.llm);
      rt.advance(id).catch((e) => console.error(`advance failed in session ${id}: ${(e as Error).message}`));
      send(res, 201, { artifactId: answered.id });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/retry$/, async ({ res, params }) => {
      const id = requireSession(rt, params[0]!).id;
      let retry: Promise<unknown>;
      try { retry = rt.retryPhase(id); }
      catch (e) { throw new HttpError(409, (e as Error).message); }
      retry.then(() => rt.advance(id)).catch((e) => console.error(`retry failed in session ${id}: ${(e as Error).message}`));
      send(res, 202, {});
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/turns$/, async ({ req, res, params }) => {
      const id = requireSession(rt, params[0]).id;
      const body = await readJson(req);
      const text = str(body.text, "text");
      const llm = llmField(body);
      if (!llm) throw new HttpError(400, "Missing field: llm");
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
        t.kind === "chatTurn" && isActive(t) && (t.input as { threadId?: string }).threadId === threadId)) {
        throw new HttpError(409, "A turn is already running in this thread");
      }
      const { taskId, done } = rt.start<{ threadId: string; messageId: string }>(id, "chatTurn", { threadId, anchor: body.anchor as string | undefined, aside: body.aside as boolean | undefined, text, llm, quote: body.quote, lines: body.lines });
      done.then(({ messageId }) => {
        const run = rt.store.getArtifact<ChatMessageData>(messageId).data.run;
        if (!run) return;
        let started: Promise<unknown>;
        try { started = rt.runPhase(id, run.phase, run.input); }
        catch (e) { rt.emit(id, "runtime", "notify", { id: `run-${run.phase}`, title: `Could not start ${run.phase}`, body: (e as Error).message } satisfies NotifyPayload); return; }
        started.then(() => rt.advance(id)).catch((e) => console.error(`${run.phase} from chat failed in session ${id}: ${(e as Error).message}`));
      }).catch((e) => console.error(`chatTurn ${taskId} failed: ${(e as Error).message}`));
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
      const status = errorStatus(e);
      if (status === 500) console.error(e);
      if (!res.headersSent) send(res, status, { error: (e as Error).message });
      else res.end();
    }
  });
}
