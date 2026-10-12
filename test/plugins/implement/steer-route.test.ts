import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../../src/runtime/store.ts";
import { Runtime, defineTask, type GitCapability, type Phase } from "../../../src/runtime/tasks.ts";
import type { LlmService } from "../../../src/runtime/llm/types.ts";
import { implementRoutes } from "../../../src/plugins/implement/server/routes.ts";
import { routeCall } from "../../helpers/route-call.ts";

const tick = () => new Promise((resolve) => setImmediate(resolve));
async function until(done: () => boolean) {
  for (let i = 0; i < 200 && !done(); i++) await tick();
  assert.ok(done(), "condition not reached");
}

function setup() {
  let runs = 0;
  const hang = defineTask<null, string>({ kind: "hang", run: (ctx) => ++runs > 1 ? Promise.resolve("done") : new Promise<string>((_, reject) => ctx.signal.addEventListener("abort", () => reject(new Error("aborted")))) });
  const distill = defineTask<{ steerId: string; taskId: string | null }, unknown>({ kind: "distillSteer", run: async () => ({ action: "add", key: "use-helpers", scope: "repo", memory: { situation: "s", observed: "o", wanted: "w", why: null, phases: ["implement"], kinds: [] } }) });
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
