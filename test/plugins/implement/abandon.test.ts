import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../../src/runtime/store.ts";
import { Runtime, type GitCapability, type SearchfoxCapability, type WebspecCapability } from "../../../src/runtime/tasks.ts";
import type { LlmService } from "../../../src/runtime/llm/types.ts";
import { implementPlugin } from "../../../src/plugins/implement/index.ts";
import { reviewPlugin } from "../../../src/plugins/review/index.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";
import { implementRoutes } from "../../../src/plugins/implement/server/routes.ts";
import { routeCall } from "../../helpers/route-call.ts";

const llm: LlmService = { defaultSelection: { backend: "claude", model: "m", effort: "low" }, async run() { throw new Error("unused"); }, async listModels() { return { claude: { models: [] }, codex: { models: [] } }; } };
function setup() {
  const store = new Store(":memory:");
  const rt = new Runtime({ store, plugins: [specPlugin, reviewPlugin, implementPlugin], llm, git: () => ({}) as GitCapability, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
  const session = (workflow: string) => store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t", workflow });
  return { store, routes: implementRoutes(rt), session };
}
const abandon = (routes: ReturnType<typeof setup>["routes"], id: string) => routeCall(routes, "POST", `/api/sessions/${id}/abandon`);

test("abandoning stores a user Abandoned artifact about the start artifact", async () => {
  const { store, routes, session } = setup();
  const s = session("implement");
  const start = store.putArtifact({ sessionId: s.id, type: "WorkflowStart", status: "verified", data: {}, provenance: { taskId: "user" } });
  const out = await abandon(routes, s.id);
  assert.equal(out.status, 201);
  const artifact = store.getArtifact(out.body.artifactId);
  assert.equal(artifact.type, "Abandoned");
  assert.deepEqual(artifact.data, {});
  assert.deepEqual(artifact.provenance, { taskId: "user" });
  assert.ok(store.listLinks(s.id).some((l) => l.from === artifact.id && l.to === start.id && l.kind === "about"));
});

test("abandoning is refused for an unknown session, another workflow and a running epoch", async () => {
  const { store, routes, session } = setup();
  assert.equal((await abandon(routes, "nope")).status, 404);
  const other = session("review");
  store.putArtifact({ sessionId: other.id, type: "WorkflowStart", status: "verified", data: {}, provenance: { taskId: "user" } });
  assert.equal((await abandon(routes, other.id)).status, 409);
  const busy = session("implement");
  store.putArtifact({ sessionId: busy.id, type: "WorkflowStart", status: "verified", data: {}, provenance: { taskId: "user" } });
  store.createEpoch(busy.id, "implement", null);
  assert.equal((await abandon(routes, busy.id)).status, 409);
  assert.deepEqual(store.listArtifacts(busy.id, "Abandoned"), []);
});
