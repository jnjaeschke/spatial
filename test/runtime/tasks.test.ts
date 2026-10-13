import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/runtime/store.ts";
import { KnowledgeStore } from "../../src/runtime/knowledge.ts";
import { BusyError, Runtime, defineTask, TaskFailedError, TaskCancelledError, PhaseBusyError, type Phase, type GitCapability } from "../../src/runtime/tasks.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";
import type { RuntimeEvent } from "../../src/shared/types.ts";

const fakeGit = {} as GitCapability;
const fakeLlm: LlmService = {
  defaultSelection: { backend: "claude", model: "m", effort: "low" },
  async run(selection, prompt) {
    prompt.onEvent?.({ kind: "usage", usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 2, cumulative: false } });
    return { text: prompt.prompt.toUpperCase(), providerSessionId: "p1", selection: selection ?? { backend: "claude", model: "m", effort: "low" } };
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

const parent = defineTask<{ child: string }, unknown>({ kind: "parent", run: (ctx, { child }) => ctx.run(child, child === "echo" ? { v: "hi" } : null) });

function setup() {
  const store = new Store(":memory:");
  const rt = new Runtime({ store, plugins: [{ id: "test", tasks: [echo, boom, slow, parent] }], llm: fakeLlm, git: () => fakeGit });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
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

test("typed artifact lookup rejects a mismatched kind with both types", async () => {
  const { rt, session } = setup();
  const task = defineTask<null, null>({ kind: "typed-get", async run(ctx) {
    const item = ctx.artifacts.put("Echo", "verified", {});
    assert.throws(() => ctx.artifacts.get(item.id, "Other"), /Artifact .* is not a Other \(got Echo\)/);
    return null;
  } });
  const runtime = new Runtime({ store: rt.store, plugins: [{ id: "typed", tasks: [task] }], llm: fakeLlm, git: () => fakeGit });
  await runtime.start(session.id, "typed-get", null).done;
});

test("a session with running work cannot be deleted until the work ends", async () => {
  const { store, rt, session } = setup();
  const { taskId, done } = rt.start(session.id, "slow", null);
  assert.throws(() => rt.deleteSession(session.id), BusyError);
  rt.cancel(taskId);
  await done.catch(() => {});
  rt.deleteSession(session.id);
  assert.deepEqual(store.listSessions(), []);
});

test("LLM activity becomes task.activity events, listed per task; the task's own onEvent still gets every event", async () => {
  const store = new Store(":memory:");
  const said = { kind: "text", text: "Looking." } as const;
  const llm: LlmService = { ...fakeLlm, async run(selection, prompt) {
    prompt.onEvent?.({ kind: "activity", activity: said });
    prompt.onEvent?.({ kind: "progress", message: "running ls" });
    return fakeLlm.run(selection, prompt, new AbortController().signal);
  } };
  const seen: string[] = [];
  const watcher = defineTask<null, null>({ kind: "watcher", async run(ctx) { await ctx.llm.run({ prompt: "p", tools: "read-only", onEvent: (e) => seen.push(e.kind) }); return null; } });
  const rt = new Runtime({ store, plugins: [{ id: "test", tasks: [echo, watcher] }], llm, git: () => fakeGit });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  const events: RuntimeEvent[] = [];
  rt.onEvent((e) => events.push(e));
  const echoed = rt.start(session.id, "echo", { v: "hi" });
  const watched = rt.start(session.id, "watcher", null);
  await Promise.all([echoed.done, watched.done]);
  assert.deepEqual(events.filter((e) => e.type === "task.activity" && e.actor === `task:${echoed.taskId}`).map((e) => e.payload), [{ taskId: echoed.taskId, activity: said }]);
  assert.deepEqual(store.listTaskActivity(session.id, watched.taskId), [said]);
  assert.deepEqual(seen, ["activity", "progress", "usage"]);
});

test("live input reaches the session's run that accepts it, and nothing once that run is done", async () => {
  const store = new Store(":memory:");
  const heard: string[] = [];
  let release!: () => void;
  const llm: LlmService = { ...fakeLlm, async run(selection, prompt) {
    prompt.onLiveInput?.((text) => heard.push(text));
    await new Promise<void>((resolve) => { release = resolve; });
    prompt.onLiveInput?.(null);
    return fakeLlm.run(selection, prompt, new AbortController().signal);
  } };
  const agent = defineTask<null, null>({ kind: "agent", async run(ctx) { await ctx.llm.run({ prompt: "p", tools: "write", liveInput: true }); return null; } });
  const rt = new Runtime({ store, plugins: [{ id: "test", tasks: [agent] }], llm, git: () => fakeGit });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  const other = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "u" });
  const { taskId, done } = rt.start(session.id, "agent", null);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(rt.sendLiveInput(other.id, "elsewhere"), []);
  assert.deepEqual(rt.sendLiveInput(session.id, "use a helper"), [taskId]);
  release();
  await done;
  assert.deepEqual(heard, ["use a helper"]);
  assert.deepEqual(rt.sendLiveInput(session.id, "too late"), []);
});

test("failing task: status failed, TaskFailedError, task.failed event", async () => {
  const { store, rt, session, events } = setup();
  const { taskId, done } = rt.start(session.id, "boom", null);
  await assert.rejects(done, (e: unknown) => e instanceof TaskFailedError && e.taskId === taskId && e.message === "kaput");
  assert.equal(store.getTask(taskId).status, "failed");
  assert.equal(store.getTask(taskId).error, "kaput");
  assert.equal(events.at(-1)?.type, "task.failed");
});

test("repo context errors fail the task and emit task.failed", async () => {
  const store = new Store(":memory:");
  const rt = new Runtime({
    store, plugins: [{ id: "test", tasks: [echo] }], llm: fakeLlm, git: () => fakeGit,
    repoContext: () => { throw new Error("bad repo context"); },
  });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  const events: RuntimeEvent[] = [];
  rt.onEvent((e) => events.push(e));
  const { taskId, done } = rt.start(session.id, "echo", { v: "hi" });
  await assert.rejects(done, (e: unknown) => e instanceof TaskFailedError && e.message === "bad repo context");
  assert.equal(store.getTask(taskId).status, "failed");
  assert.equal(events.at(-1)?.type, "task.failed");
  assert.deepEqual(events.at(-1)?.payload, { taskId, error: "bad repo context" });
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

test("an LLM run that fails or is cancelled still records its usage; one that never started records none", async () => {
  const store = new Store(":memory:");
  const usage = { inputTokens: 3, cachedInputTokens: 0, outputTokens: 1, costUsd: 0.2, cumulative: false };
  const llm: LlmService = { ...fakeLlm, async run(_selection, prompt, signal) {
    if (prompt.prompt === "unstarted") throw new Error("no CLI");
    prompt.onEvent?.({ kind: "session", providerSessionId: prompt.prompt });
    if (prompt.prompt === "failing") { prompt.onEvent?.({ kind: "usage", usage }); throw new Error("claude: is_error"); }
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
  } };
  const ask = defineTask<string, null>({ kind: "ask", async run(ctx, prompt) { await ctx.llm.run({ prompt, tools: "none" }); return null; } });
  const rt = new Runtime({ store, plugins: [{ id: "test", tasks: [ask] }], llm, git: () => fakeGit });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  await assert.rejects(rt.start(session.id, "ask", "unstarted").done, TaskFailedError);
  await assert.rejects(rt.start(session.id, "ask", "failing").done, TaskFailedError);
  const hanging = rt.start(session.id, "ask", "hanging");
  await new Promise((resolve) => setTimeout(resolve, 10));
  rt.cancel(hanging.taskId);
  await assert.rejects(hanging.done, TaskCancelledError);
  const selection = fakeLlm.defaultSelection;
  assert.deepEqual(store.listEventsOfType(session.id, "llm.usage").map((e) => e.payload), [
    { selection, providerSessionId: "failing", usage },
    { selection, providerSessionId: "hanging", usage: null },
  ]);
});

test("ctx.run starts a child task linked to its parent; a child failure fails the parent with its cause", async () => {
  const { store, rt, session } = setup();
  const { taskId, done } = rt.start(session.id, "parent", { child: "echo" });
  const out = await done;
  const [top, child] = store.listTasks(session.id);
  assert.deepEqual([top!.id, top!.parentId, child!.kind, child!.parentId, child!.output], [taskId, null, "echo", taskId, out]);
  const failing = rt.start(session.id, "parent", { child: "boom" });
  await assert.rejects(failing.done, (e: unknown) => e instanceof TaskFailedError && e.taskId === failing.taskId && e.message === "kaput" && (e.cause as TaskFailedError).cause instanceof Error);
  assert.deepEqual(store.listTasks(session.id).slice(2).map((t) => [t.kind, t.status]), [["parent", "failed"], ["boom", "failed"]]);
});

test("cancelling a parent cancels its running child", async () => {
  const { store, rt, session } = setup();
  const { taskId, done } = rt.start(session.id, "parent", { child: "slow" });
  await new Promise((resolve) => setImmediate(resolve));
  rt.cancel(taskId);
  await assert.rejects(done, (e: unknown) => e instanceof TaskCancelledError && e.taskId === taskId);
  assert.deepEqual(store.listTasks(session.id).map((t) => t.status), ["cancelled", "cancelled"]);
});

test("activeTask finds a pending or running task of a kind in any session whose input matches", async () => {
  const { store, rt, session } = setup();
  const other = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "u" });
  const { taskId, done } = rt.start(other.id, "parent", { child: "slow" });
  const queued = store.createTask({ sessionId: session.id, kind: "echo", input: { v: "q" } });
  assert.equal(rt.activeTask("parent", (input) => (input as { child: string }).child === "slow")?.id, taskId);
  assert.equal(rt.activeTask("parent", (input) => (input as { child: string }).child === "echo"), null);
  assert.equal(rt.activeTask("echo", () => true)?.id, queued.id);
  rt.cancel(taskId);
  await assert.rejects(done);
  assert.equal(rt.activeTask("parent", () => true), null);
});

test("run() resolves with output", async () => {
  const { rt, session } = setup();
  const out = await rt.run<{ artifactId: string }>(session.id, "echo", { v: "x" });
  assert.equal(typeof out.artifactId, "string");
});

test("tasks read the knowledge store and cannot write it", async () => {
  const knowledge = new KnowledgeStore(":memory:");
  knowledge.put("global", "spec", "k", 1, { by: "plugin", sessionId: "S" });
  const peek = defineTask<null, unknown>({ kind: "peek", async run(ctx) {
    const read = ctx.knowledge.get("global", "spec", "k");
    return { value: read.state === "current" ? read.entry.value : null, listed: ctx.knowledge.list("global", "spec", "").length, canPut: "put" in ctx.knowledge };
  } });
  const store = new Store(":memory:");
  const rt = new Runtime({ store, plugins: [{ id: "test", tasks: [peek] }], llm: fakeLlm, git: () => fakeGit, knowledge });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  assert.deepEqual(await rt.run(session.id, "peek", null), { value: 1, listed: 1, canPut: false });
});

test("unknown task kind and unknown session throw synchronously", () => {
  const { rt, session } = setup();
  assert.throws(() => rt.start(session.id, "nope", null), /Unknown task kind: nope/);
  assert.throws(() => rt.start("nosession", "echo", { v: "" }), /Unknown session: nosession/);
});

test("duplicate task kinds are rejected", () => {
  assert.throws(() => new Runtime({ store: new Store(":memory:"), plugins: [{ id: "test", tasks: [echo, echo] }], llm: fakeLlm, git: () => fakeGit }), /Duplicate task kind: echo/);
});

test("phases stamp tasks and artifacts and each run opens a new epoch", async () => {
  const store = new Store(":memory:");
  const phase: Phase<null> = { id: "work", async run(rt, sessionId) { await rt.run(sessionId, "echo", { v: "phase" }); } };
  const rt = new Runtime({ store, plugins: [{ id: "test", tasks: [echo], phases: [phase] }], llm: fakeLlm, git: () => fakeGit });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  const first = await rt.runPhase(session.id, "work", null);
  const firstTask = store.listTasks(session.id)[0];
  assert.equal(first.n, 1);
  assert.equal(firstTask.epoch, 1);
  assert.equal(store.getArtifact((firstTask.output as { artifactId: string }).artifactId).epoch, 1);
  assert.equal((await rt.runPhase(session.id, "work", null)).n, 2);
});

test("a session cannot start another phase while its epoch is running", async () => {
  const store = new Store(":memory:");
  let finish!: () => void;
  const phase: Phase<null> = { id: "slow", run: async () => new Promise<void>((resolve) => { finish = resolve; }) };
  const rt = new Runtime({ store, plugins: [{ id: "test", phases: [phase] }], llm: fakeLlm, git: () => fakeGit });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  const pending = rt.runPhase(session.id, "slow", null);
  assert.throws(() => rt.runPhase(session.id, "slow", null), (e: unknown) => e instanceof PhaseBusyError && e.message === `Session ${session.id} is running epoch 1 (slow)`);
  assert.equal(rt.runningEpoch(session.id)?.n, 1);
  finish();
  await pending;
  assert.equal(rt.runningEpoch(session.id), null);
});

test("failed phases retry in place and succeeded phases cannot retry", async () => {
  const store = new Store(":memory:");
  let calls = 0;
  const phase: Phase<{ value: string }> = { id: "sometimes", async run() { calls++; if (calls === 1) throw new Error("kaput"); } };
  const rt = new Runtime({ store, plugins: [{ id: "test", phases: [phase] }], llm: fakeLlm, git: () => fakeGit });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  await assert.rejects(rt.runPhase(session.id, "sometimes", { value: "saved" }), /kaput/);
  const failed = store.listEpochs(session.id)[0];
  assert.equal(failed.status, "failed");
  assert.equal(failed.error, "kaput");
  const retried = await rt.retryPhase(session.id);
  assert.equal(retried.n, failed.n);
  assert.equal(retried.status, "succeeded");
  assert.deepEqual(retried.input, { value: "saved" });
  assert.throws(() => rt.retryPhase(session.id), /Latest epoch did not fail/);
});

test("cancelEpoch aborts the tasks the running phase started and resolves once the phase stopped; other tasks of the session keep running", async () => {
  const store = new Store(":memory:");
  const phase: Phase<null> = { id: "work", async run(rt, sessionId) { await rt.run(sessionId, "slow", null); } };
  const rt = new Runtime({ store, plugins: [{ id: "test", tasks: [slow], phases: [phase] }], llm: fakeLlm, git: () => fakeGit });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  await assert.rejects(rt.cancelEpoch(session.id), /no running epoch/);
  const running = rt.runPhase(session.id, "work", null);
  const background = rt.start(session.id, "slow", null);
  const backgroundEnd = background.done.then(() => "finished", (e: unknown) => e instanceof TaskCancelledError ? "cancelled" : "failed");
  await new Promise((resolve) => setImmediate(resolve));
  const { epoch, taskIds } = await rt.cancelEpoch(session.id);
  assert.equal(epoch.status, "cancelled");
  assert.equal(taskIds.length, 1);
  assert.notEqual(taskIds[0], background.taskId);
  assert.equal(store.getTask(taskIds[0]!).status, "cancelled");
  assert.equal((await running).status, "cancelled");
  assert.equal(store.getTask(background.taskId).status, "running");
  rt.cancel(background.taskId);
  assert.equal(await backgroundEnd, "cancelled");
});

test("cancelEpoch refuses an epoch whose phase has no running task", async () => {
  const store = new Store(":memory:");
  let finish!: () => void;
  const phase: Phase<null> = { id: "idle", run: () => new Promise<void>((resolve) => { finish = resolve; }) };
  const rt = new Runtime({ store, plugins: [{ id: "test", phases: [phase] }], llm: fakeLlm, git: () => fakeGit });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  const pending = rt.runPhase(session.id, "idle", null);
  await assert.rejects(rt.cancelEpoch(session.id), /has no running task/);
  finish();
  await pending;
});

test("task contexts carry their epoch, the session's repoDir and the recent progress of a task", async () => {
  const store = new Store(":memory:");
  const probe = defineTask<null, unknown>({ kind: "probe", async run(ctx) {
    ctx.progress({ kind: "indeterminate", message: "one" });
    ctx.progress({ kind: "indeterminate", message: "two" });
    ctx.progress({ kind: "steps", step: "build", index: 1, count: 2 });
    return { epoch: ctx.epoch, repoDir: ctx.repoDir, recent: ctx.events.recent(ctx.taskId, 2), other: ctx.events.recent("nope", 5) };
  } });
  const phase: Phase<null> = { id: "probing", async run(rt, sessionId) { await rt.run(sessionId, "probe", null); } };
  const rt = new Runtime({ store, plugins: [{ id: "test", tasks: [probe], phases: [phase] }], llm: fakeLlm, git: () => fakeGit });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  assert.equal((await rt.run<{ epoch: number | null }>(session.id, "probe", null)).epoch, null);
  await rt.runPhase(session.id, "probing", null);
  assert.deepEqual(store.listTasks(session.id).at(-1)!.output, { epoch: 1, repoDir: "/repo/.git", recent: ["two", "build (1/2)"], other: [] });
});
