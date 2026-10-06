import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { dirname, join } from "node:path";
import type { HealthResponse } from "../shared/types.ts";
import { defaultDbPath } from "../runtime/create.ts";

export const DEFAULT_PORT = 4177;

/** The start screen of the repo containing `path`. */
export function startScreenUrl(port: number, path: string): string {
  return `http://127.0.0.1:${port}/?path=${encodeURIComponent(path)}`;
}

export function browserCommand(platform: NodeJS.Platform): string {
  return platform === "darwin" ? "open" : "xdg-open";
}

/** What listens on `port`: our server (its health), nothing, or something else. */
export async function probe(port: number, fetchImpl: typeof fetch = fetch): Promise<HealthResponse | "free" | "foreign"> {
  let res: Response;
  try {
    res = await fetchImpl(`http://127.0.0.1:${port}/api/health`);
  } catch (e) {
    if ((e as { cause?: { code?: string } }).cause?.code === "ECONNREFUSED") return "free";
    throw e;
  }
  if (!res.ok) return "foreign";
  const body = await res.json().catch(() => null) as Partial<HealthResponse> | null;
  return body?.app === "spatial-ide" && typeof body.ui === "boolean" ? { app: "spatial-ide", ui: body.ui } : "foreign";
}

export interface StartedServer { exited: Promise<number | null>; log: string }

/** Reuses the server on `port` or starts one and waits for its health. Health is probed before the child's exit is checked, so losing a start race to another CLI still succeeds. */
export async function ensureServer(opts: { port: number; startServer: () => StartedServer; fetchImpl?: typeof fetch; timeoutMs?: number; intervalMs?: number }): Promise<HealthResponse> {
  const foreign = () => new Error(`Port ${opts.port} is in use by another program (or a spatial server without /api/health); stop it or pass --port`);
  const first = await probe(opts.port, opts.fetchImpl);
  if (first === "foreign") throw foreign();
  if (first !== "free") return first;
  const server = opts.startServer();
  let exit: number | null | undefined;
  void server.exited.then((code) => { exit = code; });
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, opts.intervalMs ?? 100));
    const state = await probe(opts.port, opts.fetchImpl);
    if (state === "foreign") throw foreign();
    if (state !== "free") return state;
    if (exit !== undefined) throw new Error(`Server exited with code ${exit}; see ${server.log}`);
  }
  throw new Error(`Server did not answer within ${timeoutMs} ms; see ${server.log}`);
}

/** Starts `node src/server/main.ts` detached from the package root; it outlives the CLI. */
export function spawnServer(root: string, port: number, db?: string): StartedServer {
  if (!existsSync(join(root, "dist/web/index.html"))) throw new Error(`UI not built: run \`npm run build:web\` in ${root}`);
  const log = join(dirname(defaultDbPath()), "server.log");
  mkdirSync(dirname(log), { recursive: true });
  const fd = openSync(log, "a");
  const child = spawn(process.execPath, [join(root, "src/server/main.ts"), "--port", String(port), ...(db ? ["--db", db] : [])], { cwd: root, detached: true, stdio: ["ignore", fd, fd] });
  closeSync(fd);
  child.unref();
  return { exited: new Promise((resolve) => child.on("exit", (code) => resolve(code))), log };
}

export function openBrowser(url: string): void {
  const child = spawn(browserCommand(process.platform), [url], { detached: true, stdio: "ignore" });
  child.on("error", (e) => console.error(`Could not open a browser (${e.message}); open ${url}`));
  child.unref();
}
