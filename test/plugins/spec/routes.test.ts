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
  await openSpec(rt, session.id, "HTML#navigate", null);
  const trace = { traceId: "t1", title: "Trace 1", entries: [{ anchor: "HTML#navigate", step: "2", note: "" }] };
  const r = await routeCall(routes, "POST", `/api/sessions/${session.id}/spec/traces`, { trace });
  assert.equal(r.status, 201);
  assert.deepEqual(rt.store.getArtifact(r.body.artifactId).data, trace);
  for (const bad of [{ ...trace, traceId: "" }, { ...trace, entries: [{ anchor: "HTML#navigate", step: 2, note: "" }] }, { ...trace, title: 1 }]) {
    assert.equal((await routeCall(routes, "POST", `/api/sessions/${session.id}/spec/traces`, { trace: bad })).status, 400);
  }
});

test("effect-path opens the boxes of the first witness path in order", async () => {
  const { rt, session, routes } = setup();
  await openSpec(rt, session.id, "HTML#navigate", null);
  const r = await routeCall(routes, "POST", `/api/sessions/${session.id}/spec/effect-path`, { ref: "HTML#navigate", effectId: "ef_e6c5f8c3e2980985" });
  assert.deepEqual(r, { status: 201, body: { opened: 3 } });
  assert.deepEqual(rt.store.listArtifacts(session.id, "SpecOpened").slice(1).map((a) => (a.data as { anchor: string; from: { anchor: string; step: string } }).from), [
    { anchor: "HTML#navigate", step: "22.4" }, { anchor: "HTML#fire-a-push/replace/reload-navigate-event", step: "12" }, { anchor: "HTML#inner-navigate-event-firing-algorithm", step: "31.4" },
  ]);
});

test("explore opens a root box per requested anchor", async () => {
  const { rt, session, routes } = setup();
  const request = rt.store.putArtifact({ sessionId: session.id, type: "SpecExploreRequest", status: "proposed", provenance: { taskId: "t" }, data: { anchors: ["HTML#navigate", "HTML#setup"] } });
  assert.deepEqual(await routeCall(routes, "POST", `/api/sessions/${session.id}/spec/explore`, { requestId: request.id }), { status: 201, body: { opened: 2 } });
  assert.deepEqual(rt.store.listArtifacts(session.id, "SpecOpened").map((a) => a.data), [{ anchor: "HTML#navigate", from: null }, { anchor: "HTML#setup", from: null }]);
});

test("traces reject entries whose anchors are not open", async () => {
  const { rt, session, routes } = setup();
  const trace = { traceId: "t1", title: "Trace 1", entries: [{ anchor: "HTML#navigate", step: "2", note: "" }] };
  assert.equal((await routeCall(routes, "POST", `/api/sessions/${session.id}/spec/traces`, { trace })).status, 409);
  await openSpec(rt, session.id, "HTML#navigate", null);
  assert.equal((await routeCall(routes, "POST", `/api/sessions/${session.id}/spec/traces`, { trace })).status, 201);
});

test("effect-path rejects a malformed or unopened ref", async () => {
  const { session, routes } = setup();
  const path = `/api/sessions/${session.id}/spec/effect-path`;
  assert.equal((await routeCall(routes, "POST", path, { ref: "--help", effectId: "e" })).status, 400);
  assert.equal((await routeCall(routes, "POST", path, { ref: "HTML#navigate", effectId: "e" })).status, 409);
});

test("explore maps a missing section to 404", async () => {
  const { rt, session, routes } = setup();
  const request = rt.store.putArtifact({ sessionId: session.id, type: "SpecExploreRequest", status: "proposed", provenance: { taskId: "t" }, data: { anchors: ["HTML#missing"] } });
  assert.equal((await routeCall(routes, "POST", `/api/sessions/${session.id}/spec/explore`, { requestId: request.id })).status, 404);
});

test("opening the same link twice stores one SpecOpened", async () => {
  const { rt, session } = setup();
  const first = await openSpec(rt, session.id, "HTML#navigate", null);
  const second = await openSpec(rt, session.id, "HTML#navigate", null);
  const link = await openSpec(rt, session.id, "HTML#setup", { anchor: "HTML#navigate", step: "1" });
  await openSpec(rt, session.id, "HTML#setup", { anchor: "HTML#navigate", step: "2" });
  assert.equal(second.opened.id, first.opened.id);
  assert.equal((await openSpec(rt, session.id, "HTML#setup", { anchor: "HTML#navigate", step: "1" })).opened.id, link.opened.id);
  assert.equal(rt.store.listArtifacts(session.id, "SpecOpened").length, 3);
});

test("flag rejects an algorithm without a current summary", async () => {
  const { rt, session, routes } = setup();
  await openSpec(rt, session.id, "HTML#setup", null);
  assert.equal((await routeCall(routes, "POST", `/api/sessions/${session.id}/spec/summaries/flag`, { ref: "HTML#setup" })).status, 409);
});
