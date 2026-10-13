// REQUIRES_REAL_NET
import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, type GitCapability, type Phase } from "../../src/runtime/tasks.ts";
import type { Workflow } from "../../src/runtime/plugins.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";
import type { Artifact, DecisionData } from "../../src/shared/types.ts";
import { createHttpServer } from "../../src/server/http.ts";

const llm: LlmService = {
  defaultSelection: { backend: "claude", model: "m", effort: "low" },
  async run() { throw new Error("unused"); },
  async listModels() { return { claude: { models: [] }, codex: { models: [] } }; },
};
const OPTIONS = [
  { id: "go", label: "Go", takesText: true, takesModel: true },
  { id: "num", label: "Number", takesText: true, requiresText: true, textPattern: "^\\d+$" },
  { id: "stop", label: "Stop" },
];
let flakyFailures = 1;
const phase = (id: string): Phase<unknown> => ({ id, async run() { if (id === "flaky" && flakyFailures-- > 0) throw new Error("flaky"); } });
const workflow = (id: string, next: Workflow<Record<string, never>>["next"]): Workflow<Record<string, never>> => ({ id, description: id, argHint: "", params: z.strictObject({}), parseArgs: () => ({ ok: true, params: {} }), async start() {}, next });
const asking = workflow("asking", (view) => {
  const decision = view.artifacts.findLast((a) => a.type === "Decision") as Artifact<DecisionData> | undefined;
  if (view.epochs.length === 0) return decision?.data.chosen ? { run: "a", input: null } : { decide: { key: "go", question: "Go?", options: OPTIONS } };
  return null;
});
const retrying = workflow("retrying", (view) => view.epochs.length === 0 ? { run: "flaky", input: null } : null);
const guarded: Workflow<Record<string, never>> = { ...asking, id: "guarded", checkAnswer: (_view, decision, option) => option === "stop" && decision.data.key === "go" ? "Nothing to stop" : null };
const store = new Store(":memory:");
const rt = new Runtime({ store, plugins: [{ id: "t", workflows: [asking, retrying, guarded], phases: [phase("a"), phase("flaky")] }], llm, git: () => ({}) as GitCapability });
const server = createHttpServer(rt);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => server.close());
const post = (path: string, body: unknown = {}) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const session = (workflow: string) => store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t", workflow });
async function waitFor(check: () => boolean, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (check()) return; await new Promise((resolve) => setTimeout(resolve, 20)); }
  throw new Error("timeout");
}
const open = (id: string) => store.listArtifacts(id, "Decision").at(-1) as Artifact<DecisionData>;

test("a decision answer validates the option and text", async () => {
  const { id } = session("asking");
  await rt.advance(id);
  const path = `/api/sessions/${id}/decisions/${open(id).id}`;
  assert.equal((await post(path, {})).status, 400);
  assert.equal((await post(path, { option: "nope" })).status, 400);
  assert.equal((await post(path, { option: "stop", text: "x" })).status, 400);
  assert.equal((await post(path, { option: "go", text: 5 })).status, 400);
  assert.equal((await post(path, { option: "stop", llm: { backend: "claude", model: "m", effort: "low" } })).status, 400, "option takes no model");
  assert.equal((await post(path, { option: "go", llm: { backend: "claude" } })).status, 400, "malformed model");
  assert.equal((await post(path, { option: "num" })).status, 400);
  assert.equal((await post(path, { option: "num", text: "x1" })).status, 400, "text must match the option pattern");
  assert.equal(open(id).data.chosen, null);
});

test("answering stores a verified version, links it and advances the workflow", async () => {
  const { id } = session("asking");
  await rt.advance(id);
  const first = open(id);
  const res = await post(`/api/sessions/${id}/decisions/${first.id}`, { option: "go", text: " fine ", llm: { backend: "codex", model: "m", effort: "low" } });
  assert.equal(res.status, 201);
  const { artifactId } = await res.json();
  const answered = store.getArtifact<DecisionData>(artifactId);
  assert.equal(answered.status, "verified");
  assert.deepEqual(answered.provenance, { taskId: "user" });
  assert.deepEqual(answered.data.chosen, { option: "go", by: "user", text: "fine", llm: { backend: "codex", model: "m", effort: "low" } });
  assert.ok(store.listLinks(id).some((link) => link.from === artifactId && link.to === first.id && link.kind === "revises"));
  await waitFor(() => store.listEpochs(id).at(-1)?.status === "succeeded");
  assert.equal((await post(`/api/sessions/${id}/decisions/${first.id}`, { option: "go" })).status, 409, "already answered");
});

test("the answer keeps the epoch the decision was asked for, also after later epochs", async () => {
  const { id } = session("asking");
  for (const phase of ["a", "try"]) store.updateEpoch(id, store.createEpoch(id, phase, null).n, { status: "succeeded" });
  const asked = store.putArtifact<DecisionData>({ sessionId: id, type: "Decision", status: "proposed", epoch: 1, data: { key: "go", question: "Go?", options: OPTIONS, chosen: null }, provenance: { taskId: "runtime" } });
  const res = await post(`/api/sessions/${id}/decisions/${asked.id}`, { option: "stop" });
  assert.equal(store.getArtifact((await res.json()).artifactId).epoch, 1);
});

test("an older decision and a running epoch are rejected", async () => {
  const { id } = session("asking");
  await rt.advance(id);
  const older = open(id);
  store.putArtifact({ sessionId: id, type: "Decision", status: "proposed", data: { key: "other", question: "Other?", options: OPTIONS, chosen: null }, provenance: { taskId: "runtime" } });
  assert.equal((await post(`/api/sessions/${id}/decisions/${older.id}`, { option: "go" })).status, 409, "not the latest");
  const running = store.createEpoch(id, "a", null);
  assert.equal((await post(`/api/sessions/${id}/decisions/${open(id).id}`, { option: "go" })).status, 409, "epoch running");
  store.updateEpoch(id, running.n, { status: "succeeded" });
});

test("an answer the workflow refuses is 409 with its reason and leaves the decision open", async () => {
  const { id } = session("guarded");
  await rt.advance(id);
  const res = await post(`/api/sessions/${id}/decisions/${open(id).id}`, { option: "stop" });
  assert.equal(res.status, 409);
  assert.match(await res.text(), /Nothing to stop/);
  assert.equal(open(id).data.chosen, null);
  assert.equal((await post(`/api/sessions/${id}/decisions/${open(id).id}`, { option: "go" })).status, 201);
});

test("unknown sessions, artifacts and artifact types are 404", async () => {
  const { id } = session("asking");
  const note = store.putArtifact({ sessionId: id, type: "Note", status: "verified", data: { body: "n" }, provenance: { taskId: "user" } });
  assert.equal((await post(`/api/sessions/nope/decisions/x`, { option: "go" })).status, 404);
  assert.equal((await post(`/api/sessions/${id}/decisions/nope`, { option: "go" })).status, 404);
  assert.equal((await post(`/api/sessions/${id}/decisions/${note.id}`, { option: "go" })).status, 404);
});

test("retry reruns a failed epoch and advances", async () => {
  const { id } = session("retrying");
  await assert.rejects(rt.advance(id), /flaky/);
  assert.equal(store.listEpochs(id)[0]!.status, "failed");
  assert.equal((await post(`/api/sessions/${id}/retry`)).status, 202);
  await waitFor(() => store.listEpochs(id)[0]!.status === "succeeded");
  assert.equal(store.listEpochs(id).length, 1);
  assert.equal((await post(`/api/sessions/${id}/retry`)).status, 409, "latest epoch did not fail");
});
