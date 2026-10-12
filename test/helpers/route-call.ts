import { Readable } from "node:stream";
import { errorStatus, type Route } from "../../src/server/http.ts";

/** Calls the route matching `method` and `path` like the HTTP server would, without a socket. */
export async function routeCall(routes: Route[], method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const url = new URL(`http://local${path}`);
  const route = routes.find(([m, pattern]) => m === method && pattern.test(url.pathname));
  if (!route) throw new Error(`No route ${method} ${path}`);
  let status = 200, text = "", sent = false;
  const res = { get headersSent() { return sent; }, writeHead(code: number) { status = code; return this; }, end(value?: string) { text = value ?? ""; sent = true; return this; } };
  try {
    const out = await route[2]({ req: Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as never, res: res as never, params: route[1].exec(url.pathname)!.slice(1), url });
    if (!sent && out !== undefined) text = JSON.stringify(out);
  } catch (error) {
    const status = errorStatus(error);
    if (status === 500) throw error;
    return { status, body: { error: (error as Error).message } };
  }
  return { status, body: text ? JSON.parse(text) : null };
}
