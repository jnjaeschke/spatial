import { isAbsolute } from "node:path";
import { commitDetail, diffFiles, fileAt, hasCommitGraph, HttpError, logPage, refs, resolveRepo, type LogScope, type Route } from "../../../plugin-api.ts";

function param(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (!value) throw new HttpError(400, `Query parameter ${name} is required`);
  return value;
}

function count(url: URL, name: string, fallback: number): number {
  const value = url.searchParams.get(name);
  if (value === null) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new HttpError(400, `Query parameter ${name} must be a non-negative integer`);
  return number;
}

function scope(url: URL): LogScope {
  const kind = url.searchParams.get("scope") ?? "branches";
  if (kind === "all" || kind === "branches") return { kind };
  if (kind === "range") return { kind, range: param(url, "range") };
  throw new HttpError(400, `Unknown scope: ${kind}`);
}

/** Runs `read` in the work tree containing the `repo` query parameter; git and validation errors are the client's (400). */
function scmRoute(path: string, read: (worktree: string, url: URL) => Promise<unknown>): Route {
  return ["GET", new RegExp(`^/api/scm/${path}$`), async ({ url }) => {
    const repo = param(url, "repo");
    if (!isAbsolute(repo)) throw new HttpError(400, "Query parameter repo must be an absolute path");
    try {
      const { worktree } = await resolveRepo(repo);
      return await read(worktree, url);
    } catch (error) {
      throw error instanceof HttpError ? error : new HttpError(400, (error as Error).message);
    }
  }];
}

export function scmRoutes(): Route[] {
  return [
    scmRoute("refs", async (worktree) => ({ refs: await refs(worktree), commitGraph: await hasCommitGraph(worktree) })),
    scmRoute("log", (worktree, url) => logPage(worktree, scope(url), count(url, "skip", 0), count(url, "limit", 200) || 200)),
    scmRoute("commit", (worktree, url) => commitDetail(worktree, param(url, "rev"))),
    scmRoute("diff", (worktree, url) => diffFiles(worktree, url.searchParams.get("a"), param(url, "b"), url.searchParams.get("path") ?? undefined)),
    scmRoute("file", async (worktree, url) => ({ lines: await fileAt(worktree, param(url, "rev"), param(url, "path")) })),
  ];
}
