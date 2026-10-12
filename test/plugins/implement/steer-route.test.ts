import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../../src/runtime/store.ts";
import { Runtime, defineTask, type GitCapability, type Phase } from "../../../src/runtime/tasks.ts";
import type { LlmService } from "../../../src/runtime/llm/types.ts";
import { implementRoutes } from "../../../src/plugins/implement/server/routes.ts";
import { routeCall } from "../../helpers/route-call.ts";
import type { MemoryNoticeData } from "../../../src/plugins/implement/shared/types.ts";

const tick = () => new Promise((resolve) => setImmediate(resolve));
async function until(done: () => boolean) {
  for (let i = 0; i < 200 && !done(); i++) await tick();
  assert.ok(done(), "condition not reached");
}

function setup(scope = "repo") {
  let runs = 0;
  const hang = defineTask<null, string>({ kind: "hang", run: (ctx) => ++runs > 1 ? Promise.resolve("done") : new Promise<string>((_, reject) => ctx.signal.addEventListener("abort", () => reject(new Error("aborted")))) });
  const distill = defineTask<{ steerId: string; taskId: string | null }, unknown>({ kind: "distillSteer", run: async () => ({ action: "add", key: "use-helpers", scope, memory: { situation: "s", observed: "o", wanted: "w", why: null, phases: ["implement"], kinds: [] } }) });
  const phase = (id: string): Phase<unknown> => ({ id, async run(rt, sessionId) { await rt.run(sessionId, "hang", null); } });
  const store = new Store(":memory:");
  const rt = new Runtime({ store, plugins: [{ id: "test", tasks: [hang, distill], phases: [phase("implement"), phase("review")] }], llm: {} as LlmService, git: () => ({}) as GitCapability, webspec: {} as never, searchfox: {} as never });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t", workflow: "implement" });
  const start = store.putArtifact({ sessionId: session.id, type: "WorkflowStart", status: "verified", data: { via: "command", workflow: "implement", params: {}, title: "t", prompt: "p" }, provenance: { taskId: "user" } });
  return { rt, store, session, start, runs: () => runs, routes: implementRoutes(rt) };
}

test("steering stops the running epoch, stores the steer and reruns the epoch in place", async () => {
  const { rt, store, session, start, runs, routes } = setup();
  const running = rt.runPhase(session.id, "implement", { round: 1 });
  await tick();
  const response = await routeCall(routes, "POST", `/api/sessions/${session.id}/steer`, { text: "  use a helper  " });
  assert.equal(response.status, 202);
  assert.equal((await running).status, "cancelled");
  await until(() => store.listEpochs(session.id)[0]!.status === "succeeded");
  assert.equal(runs(), 2);
  const epochs = store.listEpochs(session.id);
  assert.deepEqual([epochs.length, epochs[0]!.n, epochs[0]!.input], [1, 1, { round: 1 }]);
  const steer = store.listArtifacts(session.id, "Steer")[0]!;
  assert.equal(response.body.steerId, steer.id);
  assert.deepEqual(steer.data, { text: "use a helper", epoch: 1, phase: "implement" });
  assert.deepEqual([steer.epoch, steer.status], [1, "verified"]);
  assert.ok(store.listLinks(session.id).some((link) => link.from === steer.id && link.to === start.id && link.kind === "about"));
  await until(() => store.listArtifacts(session.id, "MemoryNotice").length === 1);
  const distillation = store.listTasks(session.id).find((task) => task.kind === "distillSteer")!;
  assert.deepEqual(distillation.input, { steerId: steer.id, taskId: store.listTasks(session.id).find((task) => task.kind === "hang")!.id });
});

test("a steer about this task only is remembered for the session", async () => {
  const { rt, store, session, routes } = setup("session");
  const running = rt.runPhase(session.id, "implement", { round: 1 });
  await tick();
  await routeCall(routes, "POST", `/api/sessions/${session.id}/steer`, { text: "leave inheritance out of this patch" });
  await running;
  await until(() => store.listArtifacts(session.id, "MemoryNotice").length === 1);
  assert.equal((store.listArtifacts(session.id, "MemoryNotice")[0]!.data as MemoryNoticeData).scope, "session");
  assert.equal(rt.knowledge.get(`session:${session.id}`, "implement", "memory/use-helpers").state, "current");
  assert.equal(rt.knowledge.get("/repo/.git", "implement", "memory/use-helpers").state, "absent");
});

test("a live steer goes to the running agent without stopping the epoch, and is remembered", async () => {
  const { rt, store, session, runs, routes } = setup();
  const running = rt.runPhase(session.id, "implement", { round: 1 });
  await tick();
  const hangId = store.listTasks(session.id).find((task) => task.kind === "hang")!.id;
  const sent: string[] = [];
  rt.sendLiveInput = (_sessionId, text) => { sent.push(text); return [hangId]; };
  const response = await routeCall(routes, "POST", `/api/sessions/${session.id}/steer`, { text: " use a helper ", live: true });
  assert.equal(response.status, 202);
  assert.equal(sent.length, 1);
  assert.ok(sent[0]!.startsWith("use a helper"));
  const steer = store.listArtifacts(session.id, "Steer")[0]!;
  assert.deepEqual(steer.data, { text: "use a helper", epoch: 1, phase: "implement", live: true });
  assert.equal(store.listEpochs(session.id)[0]!.status, "running");
  assert.equal(runs(), 1);
  await until(() => store.listArtifacts(session.id, "MemoryNotice").length === 1);
  assert.equal((store.listTasks(session.id).find((task) => task.kind === "distillSteer")!.input as { taskId: string }).taskId, hangId);
  rt.cancel(hangId);
  await running.catch(() => {});
});

test("a live steer with no agent reading input is refused and stores nothing", async () => {
  const { rt, store, session, routes } = setup();
  const running = rt.runPhase(session.id, "implement", { round: 1 });
  await tick();
  const response = await routeCall(routes, "POST", `/api/sessions/${session.id}/steer`, { text: "use a helper", live: true });
  assert.equal(response.status, 409);
  assert.match(String(response.body.error), /not reading messages/);
  assert.deepEqual(store.listArtifacts(session.id, "Steer"), []);
  rt.cancel(store.listTasks(session.id).find((task) => task.kind === "hang")!.id);
  await running.catch(() => {});
});

test("a steer needs text, a running epoch and a phase that reads steers", async () => {
  const { rt, store, session, routes } = setup();
  const steer = (text: unknown) => routeCall(routes, "POST", `/api/sessions/${session.id}/steer`, { text });
  assert.equal((await steer("  ")).status, 400);
  assert.deepEqual(await steer("x"), { status: 409, body: { error: "No epoch is running" } });
  const running = rt.runPhase(session.id, "review", null);
  await tick();
  assert.deepEqual(await steer("x"), { status: 409, body: { error: "The review phase cannot be steered" } });
  await rt.cancelEpoch(session.id);
  await running;
  assert.equal(store.listArtifacts(session.id, "Steer").length, 0);
});

test("steers are limited to implement sessions and concurrent steers store only one artifact", async () => {
  const { rt, store, session, routes } = setup();
  const other = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "other", workflow: "investigate" });
  store.createEpoch(other.id, "implement", { round: 1 });
  assert.equal((await routeCall(routes, "POST", `/api/sessions/${other.id}/steer`, { text: "x" })).status, 409);
  assert.equal(store.listArtifacts(other.id, "Steer").length, 0);

  const running = rt.runPhase(session.id, "implement", { round: 1 });
  await tick();
  const responses = await Promise.all([
    routeCall(routes, "POST", `/api/sessions/${session.id}/steer`, { text: "first" }),
    routeCall(routes, "POST", `/api/sessions/${session.id}/steer`, { text: "second" }),
  ]);
  assert.deepEqual(responses.map(({ status, body }) => [status, status === 202 ? "accepted" : body]), [[202, "accepted"], [409, { error: "A steer is already being handled for this session" }]]);
  assert.equal(store.listArtifacts(session.id, "Steer").length, 1);
  await running;
});
