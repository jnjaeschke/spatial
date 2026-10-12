import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../../src/runtime/store.ts";
import { TryWatcher } from "../../../src/plugins/gecko/runtime/try-watcher.ts";
import { tryRoutes } from "../../../src/plugins/gecko/runtime/try-routes.ts";
import { routeCall } from "../../helpers/route-call.ts";

function setup() {
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: "/w", repoDir: "/w/.git", title: "t" });
  const other = store.createSession({ worktree: "/w2", repoDir: "/w2/.git", title: "o" });
  const push = store.putArtifact({ sessionId: session.id, type: "TryPush", status: "verified", provenance: { taskId: "t" }, data: { command: "./mach try auto", url: "https://treeherder.mozilla.org/jobs?repo=try&landoCommitID=42", head: "HEAD1" } });
  const rt = { store, emit: () => {} };
  const watcher = new TryWatcher(rt as never, {
    now: () => Date.parse(push.createdAt) + 3 * 86_400_000,
    treeherder: async () => ({ code: 0, stderr: "", stdout: JSON.stringify({ revision: "abc", push_id: 7, matched_jobs: 1, jobs: [] }) }),
    status: async () => ({ completed: 1, running: 1 }),
  });
  return { store, session, other, push, routes: tryRoutes(rt as never, watcher) };
}

test("the refresh route polls a push older than 24 hours and answers the latest TryRun", async () => {
  const { session, push, routes, store } = setup();
  const res = await routeCall(routes, "POST", `/api/sessions/${session.id}/try/pushes/${push.id}/refresh`, {});
  assert.equal(res.status, 200);
  assert.equal(res.body.type, "TryRun");
  assert.equal(res.body.data.push, push.id);
  assert.equal(res.body.data.pushId, 7);
  assert.equal(store.listArtifacts(session.id, "TryRun").length, 1);
});

test("the refresh route is 404 for an unknown session, an unknown push and a push of another session", async () => {
  const { session, other, push, routes } = setup();
  assert.equal((await routeCall(routes, "POST", `/api/sessions/nope/try/pushes/${push.id}/refresh`, {})).status, 404);
  assert.equal((await routeCall(routes, "POST", `/api/sessions/${session.id}/try/pushes/nope/refresh`, {})).status, 404);
  assert.equal((await routeCall(routes, "POST", `/api/sessions/${other.id}/try/pushes/${push.id}/refresh`, {})).status, 404);
});
