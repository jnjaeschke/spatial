import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "node:test";
import { reviewRoutes } from "../../../../src/plugins/review/server/routes.ts";
import { Store } from "../../../../src/runtime/store.ts";
import { HttpError, type Route } from "../../../../src/server/http.ts";
import type { Runtime } from "../../../../src/runtime/tasks.ts";

function fixture() {
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo", title: "review", workflow: "review" });
  const diff = store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: { baseSha: "b", headSha: "h", commits: [], files: [{ path: "a.ts", status: "modified", binary: false, hunks: [] }] }, provenance: { taskId: "test" } });
  const rt = { store, emit() {} } as unknown as Runtime;
  const routes = reviewRoutes(rt);
  return { store, session, diff, routes };
}

async function call(route: Route, params: string[], body: unknown) {
  let status = 0, text = "";
  const req = Readable.from([JSON.stringify(body)]) as never;
  const res = { writeHead(code: number) { status = code; return this; }, end(value?: string) { text = value ?? ""; return this; } } as never;
  try {
    await route[2]({ req, res, params, url: new URL("http://localhost/") });
  } catch (error) {
    if (error instanceof HttpError) return { status: error.status, body: { error: error.message } };
    throw error;
  }
  return { status, body: text ? JSON.parse(text) : undefined };
}

function route(routes: Route[], suffix: string): Route {
  const found = routes.find(([method, pattern]) => method === "POST" && pattern.test(`/api/sessions/test/${suffix}`));
  assert.ok(found, `route ${suffix} exists`);
  return found;
}

test("comments route validates Diff paths and rejects editing a posted comment", async () => {
  const { store, session, diff, routes } = fixture();
  const create = route(routes, "comments");
  assert.equal((await call(create, [session.id], { diffId: diff.id, lines: { path: "missing.ts", side: "new", start: 1, end: 1 }, body: "x" })).status, 400);
  assert.equal((await call(create, [session.id], { diffId: diff.id, lines: { path: "a.ts", side: "new", start: 2, end: 1 }, body: "x" })).status, 400);
  const created = await call(create, [session.id], { diffId: diff.id, lines: { path: "a.ts", side: "new", start: 1, end: 1 }, body: "inline" });
  assert.equal(created.status, 201);
  const artifactId = (created.body as { artifactId: string }).artifactId;
  store.putArtifact({ sessionId: session.id, type: "PostedComment", status: "verified", data: { comment: artifactId, source: artifactId, revision: 1, diff: 1, inlineId: 1 }, provenance: { taskId: "test" } });
  const edit = route(routes, `comments/${artifactId}`);
  assert.equal((await call(edit, [session.id, artifactId], { body: "changed" })).status, 409);
  store.close();
});
