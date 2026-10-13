import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { makeRepo } from "../../helpers/git-fixture.ts";
import { testRuntime } from "../../helpers/runtime.ts";
import { makeGit } from "../../../src/runtime/git/read.ts";
import { implementRoutes } from "../../../src/plugins/implement/server/routes.ts";
import { implementPlugin } from "../../../src/plugins/implement/index.ts";
import { reviewPlugin } from "../../../src/plugins/review/index.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";
import { routeCall } from "../../helpers/route-call.ts";
import { waitFor } from "../../helpers/wait-for.ts";

function setup() {
  const repo = makeRepo(), base = repo.commit({ "a.txt": "base\n" }, "base");
  repo.git("switch", "-q", "-c", "topic");
  const head = repo.commit({ "a.txt": "topic\n" }, "topic");
  const { rt, store, session } = testRuntime({ plugins: [specPlugin, reviewPlugin, implementPlugin], git: () => makeGit(repo.dir), session: { worktree: repo.dir, repoDir: join(repo.dir, ".git"), workflow: "implement" } });
  store.putArtifact({ sessionId: session.id, type: "WorkflowStart", status: "verified", data: {}, provenance: { taskId: "test" } });
  store.putArtifact({ sessionId: session.id, type: "ImplementBranch", status: "verified", data: { branch: "topic", baseSha: base, baseRef: "main", checkout: "new-branch" }, provenance: { taskId: "test" } });
  store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: { baseSha: base, headSha: head, commits: [], files: [] }, provenance: { taskId: "test" } });
  return { rt, store, session, routes: implementRoutes(rt), repo };
}

const adopt = (routes: ReturnType<typeof implementRoutes>, id: string) => routeCall(routes, "POST", `/api/sessions/${id}/adopt`);

test("adopt route starts one adopt epoch, rejects a concurrent request, and releases its guard", async () => {
  const { rt, session, routes, repo } = setup();
  repo.commit({ "a.txt": "moved\n" }, "moved");
  const [a, b] = await Promise.all([adopt(routes, session.id), adopt(routes, session.id)]);
  assert.deepEqual([a.status, b.status].sort(), [202, 409]);
  assert.deepEqual((a.status === 202 ? a : b).body, { mode: "moved" });
  const epoch = await waitFor(() => rt.store.listEpochs(session.id).find((e) => e.phase === "adopt" && e.status !== "running"));
  assert.deepEqual(epoch.input, { mode: "moved" });
  const third = await waitFor(async () => {
    const out = await adopt(routes, session.id);
    return out.body.error === "An adopt is already starting for this session" ? undefined : out;
  }, 2000, 20, "the adopt guard was never released");
  assert.equal(third.status, 202);
});

test("adopt route rejects a branch at its known head", async () => {
  const { session, routes } = setup();
  const out = await adopt(routes, session.id);
  assert.equal(out.status, 409);
  assert.equal(out.body.error, "The branch has not moved");
});
