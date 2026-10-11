import { Readable } from "node:stream";
import { HttpError, type Route } from "../../src/server/http.ts";

/** Calls the route matching `method` and `path` like the HTTP server would, without a socket. */
export async function routeCall(routes: Route[], method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const route = routes.find(([m, pattern]) => m === method && pattern.test(path));
  if (!route) throw new Error(`No route ${method} ${path}`);
  let status = 200, text = "", sent = false;
  const res = { get headersSent() { return sent; }, writeHead(code: number) { status = code; return this; }, end(value?: string) { text = value ?? ""; sent = true; return this; } };
  try {
    const out = await route[2]({ req: Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as never, res: res as never, params: route[1].exec(path)!.slice(1), url: new URL(`http://local${path}`) });
    if (!sent && out !== undefined) text = JSON.stringify(out);
  } catch (error) {
    if (error instanceof HttpError) return { status: error.status, body: { error: error.message } };
    throw error;
  }
  return { status, body: text ? JSON.parse(text) : null };
}
