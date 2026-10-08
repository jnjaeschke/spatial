import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../../../src/runtime/store.ts";
import { Runtime, type GitCapability } from "../../../../src/runtime/tasks.ts";
import type { DiffData, RuntimeEvent } from "../../../../src/shared/types.ts";
import { RevisionWatcher } from "../../../../src/plugins/review/runtime/revision-watcher.ts";

function setup() {
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "test" });
  let currentSha = "H1";
  let resolves = 0;
  const runtime = new Runtime({
    store, plugins: [{ id: "test", tasks: [] }], llm: {} as never, webspec: {} as never, searchfox: {} as never,
    git: () => ({ resolve: async () => { resolves++; return currentSha; } } as unknown as GitCapability),
  });
  const diff = store.putArtifact<DiffData>({ sessionId: session.id, type: "Diff", status: "verified", data: {
    baseSha: "B1", headSha: "H1", commits: [], files: [],
  }, provenance: { taskId: "test" } });
  const task = store.createTask({ sessionId: session.id, kind: "importDiff", input: { base: "main", head: "feature" } });
  store.updateTask(task.id, { status: "succeeded", output: { diffId: diff.id } });
  const watcher = new RevisionWatcher(runtime);
  const events: RuntimeEvent[] = [];
  runtime.onEvent((event) => events.push(event));
  return { store, session, runtime, watcher, events, setSha: (sha: string) => { currentSha = sha; }, resolveCount: () => resolves };
}

test("only polls watched sessions and announces each new revision once", async () => {
  const x = setup();
  await x.watcher.tick();
  assert.equal(x.resolveCount(), 0);
  const unwatch = x.watcher.watch(x.session.id);
  await x.watcher.tick();
  assert.equal(x.events.length, 0);
  x.setSha("H2");
  await x.watcher.tick();
  assert.equal(x.events.length, 1);
  assert.equal(x.events[0]!.type, "notify");
  assert.deepEqual(x.events[0]!.payload, {
    id: "revision:H2", title: "New revision available", body: "feature moved to H2",
    action: { label: "Update", path: `/api/sessions/${x.session.id}/update` },
  });
  await x.watcher.tick();
  assert.equal(x.events.length, 1);
  x.setSha("H3");
  await x.watcher.tick();
  assert.equal(x.events.length, 2);
  unwatch();
  const calls = x.resolveCount();
  await x.watcher.tick();
  assert.equal(x.resolveCount(), calls);
  x.store.close();
});

test("forgets an announcement when the ref returns to the imported revision", async () => {
  const x = setup();
  x.watcher.watch(x.session.id);
  x.setSha("H2"); await x.watcher.tick();
  x.setSha("H1"); await x.watcher.tick();
  x.setSha("H2"); await x.watcher.tick();
  assert.equal(x.events.length, 2);
  x.store.close();
});

test("watch subscriptions are reference counted and running imports suppress notices", async () => {
  const x = setup();
  const releaseOne = x.watcher.watch(x.session.id);
  const releaseTwo = x.watcher.watch(x.session.id);
  const task = x.store.createTask({ sessionId: x.session.id, kind: "importDiff", input: {} });
  x.store.updateTask(task.id, { status: "running" });
  x.setSha("H2");
  await x.watcher.tick();
  assert.equal(x.events.length, 0);
  x.store.updateTask(task.id, { status: "succeeded" });
  releaseOne();
  await x.watcher.tick();
  assert.equal(x.events.length, 1);
  releaseTwo();
  x.store.close();
});

test("watchedSessions returns distinct ids until the last subscription is released", () => {
  const x = setup();
  const other = x.store.createSession({ worktree: "/other", repoDir: "/other/.git", title: "other" });
  const releaseOne = x.watcher.watch(x.session.id);
  const releaseTwo = x.watcher.watch(x.session.id);
  const releaseOther = x.watcher.watch(other.id);
  assert.deepEqual(new Set(x.watcher.watchedSessions()), new Set([x.session.id, other.id]));
  releaseOne();
  assert.deepEqual(x.watcher.watchedSessions(), [x.session.id, other.id]);
  releaseTwo();
  assert.deepEqual(x.watcher.watchedSessions(), [other.id]);
  releaseOther();
  assert.deepEqual(x.watcher.watchedSessions(), []);
  x.store.close();
});

test("resolve errors are swallowed and logged once until the message changes", async () => {
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "test" });
  const runtime = new Runtime({ store, plugins: [{ id: "test", tasks: [] }], llm: {} as never, webspec: {} as never, searchfox: {} as never,
    git: () => ({ resolve: async () => { throw new Error("missing ref"); } } as unknown as GitCapability) });
  const diff = store.putArtifact<DiffData>({ sessionId: session.id, type: "Diff", status: "verified", data: { baseSha: "B", headSha: "H1", commits: [], files: [] }, provenance: { taskId: "test" } });
  const task = store.createTask({ sessionId: session.id, kind: "importDiff", input: { base: "main", head: "feature" } });
  store.updateTask(task.id, { status: "succeeded", output: { diffId: diff.id } });
  const watcher = new RevisionWatcher(runtime);
  watcher.watch(session.id);
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  try {
    await assert.doesNotReject(watcher.tick());
    await assert.doesNotReject(watcher.tick());
    assert.equal(errors.length, 1);
  } finally {
    console.error = original;
    store.close();
  }
});

test("snapshot sessions never announce a new revision", async () => {
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "snapshot" });
  const resolved: string[] = [];
  const runtime = new Runtime({ store, plugins: [{ id: "test", tasks: [] }], llm: {} as never, webspec: {} as never, searchfox: {} as never,
    git: () => ({ resolve: async (ref: string) => { resolved.push(ref); return "S1"; } } as unknown as GitCapability) });
  const diff = store.putArtifact<DiffData>({ sessionId: session.id, type: "Diff", status: "verified", data: { baseSha: "B1", headSha: "S1", commits: [], files: [] }, provenance: { taskId: "test" } });
  const task = store.createTask({ sessionId: session.id, kind: "importDiff", input: { base: "B1", head: "refs/spatial/worktree/0123456789ab" } });
  store.updateTask(task.id, { status: "succeeded", output: { diffId: diff.id } });
  const watcher = new RevisionWatcher(runtime);
  const events: RuntimeEvent[] = [];
  runtime.onEvent((event) => events.push(event));
  watcher.watch(session.id);
  for (let i = 0; i < 5; i++) await watcher.tick();
  assert.deepEqual(events, []);
  assert.ok(resolved.includes("refs/spatial/worktree/0123456789ab"));
  store.close();
});
