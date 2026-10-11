import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../../../src/runtime/store.ts";
import { Runtime, type GitCapability } from "../../../../src/runtime/tasks.ts";
import type { DiffData, RuntimeEvent } from "../../../../src/shared/types.ts";
import type { ConduitClient } from "../../../../src/plugins/review/runtime/conduit.ts";
import { PhabricatorSyncer } from "../../../../src/plugins/review/runtime/phabricator-sync.ts";
import { latestPhabSync } from "../../../../src/plugins/review/shared/phab-anchor.ts";
import { plugins } from "../../../../src/plugins/index.ts";
import { corePlugin } from "../../../../src/runtime/create.ts";

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

function setup(opts: { trailer?: boolean; remotes?: ReturnType<typeof remote>[]; pages?: unknown[]; commits?: { sha: string; body: string }[]; texts?: Record<string, string>; pagesByRevision?: Record<number, unknown>; llm?: unknown } = {}) {
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "test" });
  const commits = opts.commits ?? [{ sha: "H", body: opts.trailer === false ? "" : "Differential Revision: https://phab.example.com/D1" }];
  const diff = store.putArtifact<DiffData>({ sessionId: session.id, type: "Diff", status: "verified", data: {
    baseSha: "B", headSha: commits.at(-1)!.sha, commits: commits.map((commit) => ({ ...commit, subject: "change" })), files: [],
  }, provenance: { taskId: "test" } });
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const versions = { remotes: opts.remotes ?? [remote(1)], pages: opts.pages ?? [transactions()], pagesByRevision: opts.pagesByRevision ?? {} };
  const revisionId = (params: Record<string, unknown>) => Array.isArray((params.constraints as { ids?: number[] } | undefined)?.ids) ? (params.constraints as { ids: number[] }).ids[0]! : Number((params.objectIdentifier as string).replace("PHID-DREV-", ""));
  const conduit = { call: async (method: string, params: Record<string, unknown>) => {
    calls.push({ method, params });
    if (method === "differential.revision.search") return { data: [{ phid: `PHID-DREV-${revisionId(params)}` }] };
    if (method === "differential.diff.search") { const id = Number((params.constraints as { revisionPHIDs: string[] }).revisionPHIDs[0]!.replace("PHID-DREV-", "")); return { data: versions.remotes.filter((item) => Math.floor(item.id / 10) === id || (id === 1 && item.id < 10)).map(({ id, phid }) => ({ id, phid })) }; }
    if (method === "differential.getrawdiff") return versions.remotes.find((item) => item.id === params.diffID)?.text ?? "";
    if (method === "transaction.search") { const id = Number((params.objectIdentifier as string).replace("PHID-DREV-", "")); return versions.pagesByRevision[id] ?? versions.pages[0]; }
    if (method === "user.whoami") return { phid: "ME", userName: "me", realName: "Me" };
    if (method === "user.search") return { data: [{ phid: "U1", fields: { username: "alice" } }] };
    throw new Error(`unexpected ${method}`);
  } } as unknown as ConduitClient;
  const runtime = new Runtime({ store, plugins: [corePlugin, ...plugins], llm: (opts.llm ?? {}) as never, webspec: {} as never, searchfox: {} as never,
    git: () => ({ diff: async (base: string, head: string) => opts.texts?.[`${base}..${head}`] ?? local } as unknown as GitCapability) });
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

test("starts one Phabricator thread summary for a new four-comment set and no duplicate while pending", async () => {
  let release!: (value: unknown) => void;
  let calls = 0;
  const llm = { defaultSelection: { backend: "claude", model: "sonnet", effort: "low" }, run: async () => { calls++; return new Promise((resolve) => { release = resolve; }); }, async listModels() { return { claude: { models: [] }, codex: { models: [] } }; } };
  const items = ["C1", "C2", "C3", "C4"].map((phid, index) => ({ id: index + 10, type: "inline", dateCreated: index + 10, fields: { path: "a.txt", line: 1, length: 1, diff: { id: 1 }, isNewFile: true, isDone: false, ...(index ? { replyToCommentPHID: `C${index}` } : {}) }, comments: [{ phid, version: 1, authorPHID: "U1", content: { raw: `body ${index + 1}` }, removed: false }] }));
  const x = setup({ pages: [transactions(items)], llm });
  await x.syncer.tick();
  assert.equal(x.store.listTasks(x.session.id).filter((task) => task.kind === "summarizePhabThread").length, 1);
  await x.syncer.tick();
  assert.equal(x.store.listTasks(x.session.id).filter((task) => task.kind === "summarizePhabThread").length, 1);
  assert.equal(calls, 1);
  release({ json: { summary: "A summary." }, selection: { backend: "claude", model: "haiku", effort: "low" } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  x.store.close();
});

test("a failed Phabricator thread summary is not retried until the thread gets a new comment", async () => {
  let calls = 0;
  const llm = { defaultSelection: { backend: "claude", model: "sonnet", effort: "low" }, run: async () => { calls++; throw new Error("model down"); }, async listModels() { return { claude: { models: [] }, codex: { models: [] } }; } };
  const items = ["C1", "C2", "C3", "C4"].map((phid, index) => ({ id: index + 10, type: "inline", dateCreated: index + 10, fields: { path: "a.txt", line: 1, length: 1, diff: { id: 1 }, isNewFile: true, isDone: false, ...(index ? { replyToCommentPHID: `C${index}` } : {}) }, comments: [{ phid, version: 1, authorPHID: "U1", content: { raw: `body ${index + 1}` }, removed: false }] }));
  const x = setup({ pages: [transactions(items)], llm });
  await x.syncer.tick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await x.syncer.tick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 1);
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
  assert.equal(latestPhabSync(x.store.listArtifacts(x.session.id), x.diff.id, 1)?.data.matchingDiffId, 1);
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
  assert.equal(latestPhabSync(x.store.listArtifacts(x.session.id), x.diff.id, 1)?.data.matchingDiffId, null);
  assert.equal(x.events.some((event) => event.type === "notify"), false);
  const next = x.store.putArtifact<DiffData>({ sessionId: x.session.id, type: "Diff", status: "verified", data: {
    baseSha: "B", headSha: "H2", commits: [{ sha: "H2", subject: "change", body: "Differential Revision: https://phab.example.com/D1" }], files: [],
  }, provenance: { taskId: "test" } });
  await x.syncer.tick();
  assert.equal(x.store.listArtifacts(x.session.id, "PhabSync").length, 2);
  assert.equal(latestPhabSync(x.store.listArtifacts(x.session.id), next.id, 1)?.data.matchingDiffId, null);
  assert.equal(latestPhabSync(x.store.listArtifacts(x.session.id), x.diff.id, 1)?.data.localDiff, x.diff.id);
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

test("polls each stack revision against its own commit range", async () => {
  const x = setup({ commits: [
    { sha: "C1", body: "Differential Revision: https://phab.example.com/D1" },
    { sha: "H", body: "Differential Revision: https://phab.example.com/D2" },
  ], remotes: [remote(11, "one"), remote(21, "two")], texts: { "B..C1": "one", "C1..H": "two" } });
  await x.syncer.tick();
  const artifacts = x.store.listArtifacts(x.session.id);
  assert.equal(latestPhabSync(artifacts, x.diff.id, 1)?.data.matchingDiffId, 11);
  assert.equal(latestPhabSync(artifacts, x.diff.id, 2)?.data.matchingDiffId, 21);
  x.store.close();
});

test("imports and announces comments and newer diffs independently for each revision", async () => {
  const one = local;
  const two = local.replace("+new", "+two");
  const x = setup({ commits: [
    { sha: "C1", body: "Differential Revision: https://phab.example.com/D1" },
    { sha: "H", body: "Differential Revision: https://phab.example.com/D2" },
  ], remotes: [remote(11, one), remote(12, one.replace("+new", "+newer")), remote(21, two), remote(22, two.replace("+two", "+newer"))], pagesByRevision: {
    1: transactions(), 2: transactions(),
  }, texts: { "B..C1": one, "C1..H": two } });
  await x.syncer.tick();
  x.versions.pagesByRevision[1] = transactions([tx(10, "C1", "first")]);
  x.versions.pagesByRevision[2] = transactions([tx(20, "C2", "second")]);
  await x.syncer.tick();
  const comments = x.store.listArtifacts(x.session.id, "PhabComment");
  assert.deepEqual(comments.map((item) => (item.data as { revision: number }).revision), [1, 2]);
  const notices = x.events.filter((event) => event.type === "notify").map((event) => event.payload as { title: string });
  assert.deepEqual(notices.map((notice) => notice.title), ["D1 has a new diff (Diff 2)", "D2 has a new diff (Diff 2)", "D1: 1 new comment", "D2: 1 new comment"]);
  const count = notices.length;
  await x.syncer.tick();
  assert.equal(x.events.filter((event) => event.type === "notify").length, count);
  x.store.close();
});

test("assigns trailer-less commits to the following range and ignores trailing commits", async () => {
  const first = setup({ commits: [
    { sha: "W", body: "no trailer" }, { sha: "H", body: "Differential Revision: https://phab.example.com/D1" },
  ], remotes: [remote(1, "whole")], texts: { "B..H": "whole" } });
  await first.syncer.tick();
  assert.equal(latestPhabSync(first.store.listArtifacts(first.session.id), first.diff.id, 1)?.data.matchingDiffId, 1);
  first.store.close();
  const second = setup({ commits: [
    { sha: "C1", body: "Differential Revision: https://phab.example.com/D1" }, { sha: "W", body: "no trailer" },
    { sha: "H", body: "Differential Revision: https://phab.example.com/D2" }, { sha: "TAIL", body: "no trailer" },
  ], remotes: [remote(11, "first"), remote(21, "second")], texts: { "B..C1": "first", "C1..H": "second", "H..TAIL": "wrong" } });
  await second.syncer.tick();
  assert.equal(latestPhabSync(second.store.listArtifacts(second.session.id), second.diff.id, 1)?.data.matchingDiffId, 11);
  assert.equal(latestPhabSync(second.store.listArtifacts(second.session.id), second.diff.id, 2)?.data.matchingDiffId, 21);
  second.store.close();
});

test("quotes inline comments from their raw diff, fetching uncached diff ids on demand", async () => {
  const raw = "diff --git a/a.txt b/a.txt\n@@ -1 +1 @@\n-old text\n+new text\n";
  const comments = [inlineTx(10, false),
    { ...inlineTx(11, false), comments: [{ ...inlineTx(11, false).comments[0], phid: "CI2" }], fields: { ...inlineTx(11, false).fields, line: 1, isNewFile: false, diff: { id: 99 } } },
    { ...inlineTx(12, false), comments: [{ ...inlineTx(12, false).comments[0], phid: "CI3" }], fields: { ...inlineTx(12, false).fields, diff: { id: 100 } } },
  ];
  const x = setup({ remotes: [remote(1, raw), remote(99, raw)], pages: [transactions(comments)] });
  await x.syncer.tick();
  const imported = x.store.listArtifacts(x.session.id, "PhabComment").map((item) => item.data as { quote?: string });
  assert.deepEqual(imported.map((item) => item.quote), ["new text", "old text", undefined]);
  assert.equal(x.calls.filter((call) => call.method === "differential.getrawdiff" && call.params.diffID === 99).length, 1);
  x.store.close();
});
