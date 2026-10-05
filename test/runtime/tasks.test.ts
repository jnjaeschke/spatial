import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, defineTask, TaskFailedError, TaskCancelledError, type GitCapability, type WebspecCapability, type SearchfoxCapability } from "../../src/runtime/tasks.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";
import type { RuntimeEvent } from "../../src/shared/types.ts";

const fakeGit = {} as GitCapability;
const webspec = {} as WebspecCapability;
const searchfox = {} as SearchfoxCapability;
const fakeLlm: LlmService = {
  defaultSelection: { backend: "claude", model: "m", effort: "low" },
  async run(selection, prompt) {
    return { text: prompt.prompt.toUpperCase(), providerSessionId: "p1", selection: selection ?? { backend: "claude", model: "m", effort: "low" }, usage: { inputTokens: 1, outputTokens: 2 } };
  },
  async listModels() {
    return { claude: { models: [] }, codex: { models: [] } };
  },
};

const echo = defineTask<{ v: string }, { artifactId: string }>({
  kind: "echo",
  async run(ctx, input) {
    ctx.progress({ kind: "indeterminate", message: "working" });
    const r = await ctx.llm.run({ prompt: input.v, tools: "none" });
    const a = ctx.artifacts.put("Echo", "proposed", { text: r.text }, r.selection);
    ctx.links.put(a.id, "somewhere#x", "about");
    return { artifactId: a.id };
  },
});
const boom = defineTask<null, never>({ kind: "boom", async run() { throw new Error("kaput"); } });
const slow = defineTask<null, string>({
  kind: "slow",
  run: (ctx) => new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve("late"), 5000);
    ctx.signal.addEventListener("abort", () => { clearTimeout(t); reject(new Error("aborted")); });
  }),
});

function setup() {
  const store = new Store(":memory:");
  const rt = new Runtime({ store, tasks: [echo, boom, slow], llm: fakeLlm, git: () => fakeGit, webspec, searchfox });
  const session = store.createSession("/repo", "t");
  const events: RuntimeEvent[] = [];
  rt.onEvent((e) => events.push(e));
  return { store, rt, session, events };
}

test("successful task: lifecycle, artifact provenance, links, events", async () => {
  const { store, rt, session, events } = setup();
  const { taskId, done } = rt.start(session.id, "echo", { v: "hi" });
  const out = (await done) as { artifactId: string };
  const task = store.getTask(taskId);
  assert.equal(task.status, "succeeded");
  assert.deepEqual(task.output, out);
  const a = store.getArtifact<{ text: string }>(out.artifactId);
  assert.equal(a.data.text, "HI");
  assert.deepEqual(a.provenance, { taskId, llm: { backend: "claude", model: "m", effort: "low" } });
  assert.equal(store.listLinks(session.id)[0].from, a.id);
  assert.deepEqual(events.map((e) => e.type), ["task.started", "task.progress", "llm.usage", "artifact.created", "link.created", "task.succeeded"]);
  assert.ok(events.every((e) => e.actor === `task:${taskId}`));
  assert.deepEqual(store.listEvents(session.id).map((e) => e.id), events.map((e) => e.id));
});

test("failing task: status failed, TaskFailedError, task.failed event", async () => {
  const { store, rt, session, events } = setup();
  const { taskId, done } = rt.start(session.id, "boom", null);
  await assert.rejects(done, (e: unknown) => e instanceof TaskFailedError && e.taskId === taskId && e.message === "kaput");
  assert.equal(store.getTask(taskId).status, "failed");
  assert.equal(store.getTask(taskId).error, "kaput");
  assert.equal(events.at(-1)?.type, "task.failed");
});

test("cancel aborts ctx.signal and marks task cancelled", async () => {
  const { store, rt, session, events } = setup();
  const { taskId, done } = rt.start(session.id, "slow", null);
  rt.cancel(taskId);
  await assert.rejects(done, (e: unknown) => e instanceof TaskCancelledError && e.taskId === taskId);
  assert.equal(store.getTask(taskId).status, "cancelled");
  assert.equal(events.at(-1)?.type, "task.cancelled");
  assert.throws(() => rt.cancel(taskId), /not running/);
});

test("run() resolves with output", async () => {
  const { rt, session } = setup();
  const out = await rt.run<{ artifactId: string }>(session.id, "echo", { v: "x" });
  assert.equal(typeof out.artifactId, "string");
});

test("unknown task kind and unknown session throw synchronously", () => {
  const { rt, session } = setup();
  assert.throws(() => rt.start(session.id, "nope", null), /Unknown task kind: nope/);
  assert.throws(() => rt.start("nosession", "echo", { v: "" }), /Unknown session: nosession/);
});

test("duplicate task kinds are rejected", () => {
  assert.throws(() => new Runtime({ store: new Store(":memory:"), tasks: [echo, echo], llm: fakeLlm, git: () => fakeGit, webspec, searchfox }), /Duplicate task kind: echo/);
});
