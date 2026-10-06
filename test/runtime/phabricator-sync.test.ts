import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, type GitCapability } from "../../src/runtime/tasks.ts";
import type { DiffData, RuntimeEvent } from "../../src/shared/types.ts";
import type { ConduitClient } from "../../src/runtime/conduit.ts";
import { PhabricatorSyncer } from "../../src/runtime/phabricator-sync.ts";
import { latestPhabSync } from "../../src/shared/phab-anchor.ts";

const local = "diff --git a/a.txt b/a.txt\n@@ -1 +1 @@\n-old\n+new\n";
const remote = (id: number, text = local) => ({ id, phid: `PHID-DIFF-${id}`, text });
const transactions = (comments: unknown[] = []) => ({ data: comments, cursor: { limit: "50", after: null, before: null } });
const tx = (id: number, phid: string, body: string, version = 1, done = false) => ({
  id, type: "comment", dateCreated: id, comments: [{ phid, version, authorPHID: "U1", content: { raw: body }, removed: false }], fields: {},
});
const inlineTx = (id: number, done: boolean) => ({
  id, type: "inline", dateCreated: id, fields: { path: "a.txt", line: 1, length: 1, diff: { id: 1 }, isNewFile: true, isDone: done },
  comments: [{ phid: "CI", version: 1, authorPHID: "U1", content: { raw: "inline" }, removed: false }],
});

function setup(opts: { trailer?: boolean; remotes?: ReturnType<typeof remote>[]; pages?: unknown[] } = {}) {
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "test" });
  const body = opts.trailer === false ? "" : "Differential Revision: https://phab.example.com/D1";
  const diff = store.putArtifact<DiffData>({ sessionId: session.id, type: "Diff", status: "verified", data: {
    baseSha: "B", headSha: "H", commits: [{ sha: "H", subject: "change", body }], files: [],
  }, provenance: { taskId: "test" } });
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const versions = { remotes: opts.remotes ?? [remote(1)], pages: opts.pages ?? [transactions()] };
  const conduit = { call: async (method: string, params: Record<string, unknown>) => {
    calls.push({ method, params });
    if (method === "differential.revision.search") return { data: [{ phid: "PHID-DREV-1" }] };
    if (method === "differential.diff.search") return { data: versions.remotes.map(({ id, phid }) => ({ id, phid })) };
    if (method === "differential.getrawdiff") return versions.remotes.find((item) => item.id === params.diffID)?.text ?? "";
    if (method === "transaction.search") return versions.pages[0];
    if (method === "user.whoami") return { phid: "ME", userName: "me", realName: "Me" };
    if (method === "user.search") return { data: [{ phid: "U1", fields: { username: "alice" } }] };
    throw new Error(`unexpected ${method}`);
  } } as unknown as ConduitClient;
  const runtime = new Runtime({ store, tasks: [], llm: {} as never, webspec: {} as never, searchfox: {} as never,
    git: () => ({ diff: async () => local } as unknown as GitCapability) });
  const watcher = { watchedSessions: () => [session.id] };
  const events: RuntimeEvent[] = [];
  runtime.onEvent((event) => events.push(event));
  const syncer = new PhabricatorSyncer(runtime, watcher, { makeConduit: () => conduit });
  return { store, session, diff, runtime, syncer, events, calls, versions };
}

test("does not contact Conduit for an unwatched session", async () => {
  const x = setup();
  await new PhabricatorSyncer(x.runtime, { watchedSessions: () => [] }, { makeConduit: () => { throw new Error("must not construct"); } }).tick();
  assert.equal(x.calls.length, 0);
  x.store.close();
});

test("no trailer causes no conduit calls or events", async () => {
  const x = setup({ trailer: false });
  await x.syncer.tick();
  assert.equal(x.calls.length, 0);
  assert.deepEqual(x.events, []);
  x.store.close();
});

test("announces each newer remote diff once and stores matching state idempotently", async () => {
  const x = setup({ remotes: [remote(1), remote(2, local.replace("+new", "+other"))] });
  await x.syncer.tick();
  const notice = x.events.find((event) => event.type === "notify")!;
  assert.deepEqual(notice.payload, { id: "phab-diff:D1:2", title: "D1 has a new diff (Diff 2)", body: "Run `moz-phab patch D1` to fetch it (diff 2)" });
  assert.equal(latestPhabSync(x.store.listArtifacts(x.session.id), x.diff.id)?.data.matchingDiffId, 1);
  const syncs = x.store.listArtifacts(x.session.id, "PhabSync").length;
  assert.equal(x.calls.filter((call) => call.method === "differential.getrawdiff").length, 2);
  await x.syncer.tick();
  assert.equal(x.store.listArtifacts(x.session.id, "PhabSync").length, syncs);
  assert.equal(x.calls.filter((call) => call.method === "differential.getrawdiff").length, 2);
  assert.equal(x.events.filter((event) => event.type === "notify").length, 1);
  x.versions.remotes.push(remote(3, "different"));
  await x.syncer.tick();
  assert.equal(x.events.filter((event => event.type === "notify")).length, 2);
  x.store.close();
});

test("records a null match without a notice and keeps each local epoch's sync", async () => {
  const x = setup({ remotes: [remote(1, "different")] });
  await x.syncer.tick();
  assert.equal(latestPhabSync(x.store.listArtifacts(x.session.id), x.diff.id)?.data.matchingDiffId, null);
  assert.equal(x.events.some((event) => event.type === "notify"), false);
  const next = x.store.putArtifact<DiffData>({ sessionId: x.session.id, type: "Diff", status: "verified", data: {
    baseSha: "B", headSha: "H2", commits: [{ sha: "H2", subject: "change", body: "Differential Revision: https://phab.example.com/D1" }], files: [],
  }, provenance: { taskId: "test" } });
  await x.syncer.tick();
  assert.equal(x.store.listArtifacts(x.session.id, "PhabSync").length, 2);
  assert.equal(latestPhabSync(x.store.listArtifacts(x.session.id), next.id)?.data.matchingDiffId, null);
  assert.equal(latestPhabSync(x.store.listArtifacts(x.session.id), x.diff.id)?.data.localDiff, x.diff.id);
  x.store.close();
});

test("imports comments, baselines the first poll, indexes current bodies, and notifies later comments", async () => {
  const x = setup({ pages: [transactions([tx(10, "C1", "first body"), tx(11, "C2", "second body"), tx(12, "C3", "third body")])] });
  await x.syncer.tick();
  assert.equal(x.store.listArtifacts(x.session.id, "PhabComment").length, 3);
  assert.equal(x.events.filter((event) => event.type === "notify").length, 0);
  assert.equal(x.store.search(x.session.id, "first", { kinds: ["comment"] as never }).length, 1);
  x.versions.pages[0] = transactions([tx(10, "C1", "first body"), tx(11, "C2", "second body"), tx(12, "C3", "third body"), tx(13, "C4", "fourth body")]);
  await x.syncer.tick();
  assert.equal(x.store.listArtifacts(x.session.id, "PhabComment").length, 4);
  assert.deepEqual(x.events.filter((event) => event.type === "notify").at(-1)?.payload, { id: "phab-comments:D1:13", title: "D1: 1 new comment", body: "alice" });
  x.store.close();
});

test("edited comment versions replace their search entry", async () => {
  const x = setup({ pages: [transactions([tx(10, "C1", "old wording")])] });
  await x.syncer.tick();
  x.versions.pages[0] = transactions([tx(11, "C1", "new wording", 2)]);
  await x.syncer.tick();
  const comments = x.store.listArtifacts(x.session.id, "PhabComment");
  assert.equal(comments.length, 2);
  assert.equal(x.store.listLinks(x.session.id).some((link) => link.kind === "revises" && link.from === comments[1]!.id && link.to === comments[0]!.id), true);
  assert.equal(x.store.search(x.session.id, "old", { kinds: ["comment"] as never }).length, 0);
  assert.equal(x.store.search(x.session.id, "new", { kinds: ["comment"] as never }).length, 1);
  x.store.close();
});

test("done toggles revise comments without sending a new-comment notice", async () => {
  const x = setup({ pages: [transactions([inlineTx(10, false)])] });
  await x.syncer.tick();
  x.versions.pages[0] = transactions([inlineTx(11, true)]);
  await x.syncer.tick();
  const comments = x.store.listArtifacts(x.session.id, "PhabComment");
  assert.equal(comments.length, 2);
  assert.equal((comments[1]!.data as { done: boolean }).done, true);
  assert.equal(x.store.listLinks(x.session.id).some((link) => link.from === comments[1]!.id && link.to === comments[0]!.id && link.kind === "revises"), true);
  assert.equal(x.events.filter((event) => (event.payload as { id?: string }).id?.startsWith("phab-comments:")).length, 0);
  x.store.close();
});

test("Conduit failures are swallowed and logged once per identical message", async () => {
  const x = setup();
  const syncer = new PhabricatorSyncer(x.runtime, { watchedSessions: () => [x.session.id] }, { makeConduit: () => ({ call: async () => { throw new Error("offline"); } } as unknown as ConduitClient) });
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  try {
    await assert.doesNotReject(syncer.tick());
    await assert.doesNotReject(syncer.tick());
    assert.equal(errors.length, 1);
  } finally {
    console.error = original;
    x.store.close();
  }
});
