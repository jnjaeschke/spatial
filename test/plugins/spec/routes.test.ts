import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Store } from "../../../src/runtime/store.ts";
import { Runtime, type GitCapability, type SearchfoxCapability } from "../../../src/runtime/tasks.ts";
import type { LlmService } from "../../../src/runtime/llm/types.ts";
import { corePlugin } from "../../../src/runtime/create.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";
import { specRoutes } from "../../../src/plugins/spec/server/routes.ts";
import { openSpec } from "../../../src/plugins/spec/runtime/open.ts";
import { makeWebspec } from "../../../src/runtime/webspec.ts";
import { routeCall } from "../../helpers/route-call.ts";

function setup() {
  const webspec = makeWebspec({ bin: fileURLToPath(new URL("../../stubs/fake-webspec.mjs", import.meta.url)) });
  const rt = new Runtime({ store: new Store(":memory:"), plugins: [corePlugin, specPlugin], llm: {} as LlmService, git: () => ({}) as GitCapability, webspec, searchfox: {} as SearchfoxCapability });
  const session = rt.store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  rt.store.putArtifact({ sessionId: session.id, type: "WorkflowStart", status: "verified", provenance: { taskId: "user" }, data: { via: "command", workflow: "explore", params: { query: "HTML#navigate" }, title: "t", prompt: "HTML#navigate" } });
  return { rt, session, routes: specRoutes(rt) };
}

test("open stores a SpecOpened from a step of an open box", async () => {
  const { rt, session, routes } = setup();
  await openSpec(rt, session.id, "HTML#navigate", null);
  const r = await routeCall(routes, "POST", `/api/sessions/${session.id}/spec/open`, { anchor: "HTML#snapshotting-source-snapshot-params", from: { anchor: "HTML#navigate", step: "2" } });
  assert.equal(r.status, 201);
  const artifact = rt.store.getArtifact(r.body.openedId);
  assert.deepEqual({ type: artifact.type, data: artifact.data, provenance: artifact.provenance }, { type: "SpecOpened", data: { anchor: "HTML#snapshotting-source-snapshot-params", from: { anchor: "HTML#navigate", step: "2" } }, provenance: { taskId: "user" } });
});

test("open rejects a source that was never opened, an unknown section, a malformed anchor or from, and reports a failed lookup", async () => {
  const { session, routes } = setup();
  assert.equal((await routeCall(routes, "POST", `/api/sessions/${session.id}/spec/open`, { anchor: "HTML#a", from: { anchor: "HTML#navigate", step: "1" } })).status, 409);
  assert.equal((await routeCall(routes, "POST", `/api/sessions/${session.id}/spec/open`, { anchor: "HTML#missing", from: null })).status, 404);
  for (const anchor of ["nope", "--help"]) assert.equal((await routeCall(routes, "POST", `/api/sessions/${session.id}/spec/open`, { anchor, from: null })).status, 400);
  assert.equal((await routeCall(routes, "POST", `/api/sessions/${session.id}/spec/open`, { anchor: "HTML#broken", from: null })).status, 502);
  assert.equal((await routeCall(routes, "POST", `/api/sessions/${session.id}/spec/open`, { anchor: "HTML#a", from: { anchor: "HTML#navigate" } })).status, 400);
});

test("traces store user versions and reject malformed ones", async () => {
  const { rt, session, routes } = setup();
  const trace = { traceId: "t1", title: "Trace 1", entries: [{ anchor: "HTML#navigate", step: "2", note: "" }] };
  const r = await routeCall(routes, "POST", `/api/sessions/${session.id}/spec/traces`, { trace });
  assert.equal(r.status, 201);
  assert.deepEqual(rt.store.getArtifact(r.body.artifactId).data, trace);
  for (const bad of [{ ...trace, traceId: "" }, { ...trace, entries: [{ anchor: "HTML#navigate", step: 2, note: "" }] }, { ...trace, title: 1 }]) {
    assert.equal((await routeCall(routes, "POST", `/api/sessions/${session.id}/spec/traces`, { trace: bad })).status, 400);
  }
});
