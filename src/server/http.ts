import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import type { DiffData, LlmSelection, ModelsResponse } from "../shared/types.ts";
import { createSession } from "../runtime/git.ts";
import { buildSessionState } from "../runtime/state.ts";
import type { Runtime } from "../runtime/tasks.ts";
import { narratePatch } from "../workflows/narrate-patch.ts";

class HttpError extends Error {
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

type Ctx = { req: IncomingMessage; res: ServerResponse; params: string[]; url: URL };
type Route = [method: string, pattern: RegExp, handler: (c: Ctx) => Promise<unknown>];

function send(res: ServerResponse, status: number, body?: unknown) {
  if (body === undefined) res.writeHead(status).end();
  else res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
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

const str = (v: unknown, name: string): string => {
  if (typeof v !== "string" || v === "") throw new HttpError(400, `Missing string field: ${name}`);
  return v;
};

function requireSession(rt: Runtime, id: string) {
  try {
    return rt.store.getSession(id);
  } catch {
    throw new HttpError(404, `Unknown session: ${id}`);
  }
}

export function createHttpServer(rt: Runtime, opts: { staticDir?: string } = {}): Server {
  const routes: Route[] = [
    ["GET", /^\/api\/sessions$/, async () => rt.store.listSessions()],
    ["POST", /^\/api\/sessions$/, async ({ req, res }) => {
      const body = await readJson(req);
      try {
        send(res, 201, await createSession(rt.store, str(body.repo, "repo"), str(body.title, "title")));
      } catch (e) {
        throw e instanceof HttpError ? e : new HttpError(400, (e as Error).message);
      }
    }],
    ["GET", /^\/api\/sessions\/([^/]+)\/state$/, async ({ params }) => {
      requireSession(rt, params[0]);
      return buildSessionState(rt.store, params[0]);
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
      const write = (e: { id: number }) => res.write(`id: ${e.id}\nevent: runtime\ndata: ${JSON.stringify(e)}\n\n`);
      for (const e of rt.store.listEvents(id, after)) write(e);
      const off = rt.onEvent((e) => { if (e.sessionId === id) write(e); });
      const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
      res.on("close", () => { off(); clearInterval(ping); });
    }],
    ["POST", /^\/api\/sessions\/([^/]+)\/narrate$/, async ({ req, res, params }) => {
      const id = requireSession(rt, params[0]).id;
      const body = await readJson(req);
      const llm = body.llm as LlmSelection | undefined;
      narratePatch(rt, id, { base: str(body.base, "base"), head: str(body.head, "head"), llm }).catch((e) =>
        console.error(`narrate failed in session ${id}: ${(e as Error).message}`),
      );
      send(res, 202, {});
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
