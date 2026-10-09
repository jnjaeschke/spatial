import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTransactions, fetchTransactions, storeRemoteComments } from "../../../../src/plugins/review/runtime/phab-transactions.ts";
import { latestPhabComments } from "../../../../src/plugins/review/shared/phab-comments.ts";
import { Store } from "../../../../src/runtime/store.ts";
import type { RemoteComment } from "../../../../src/plugins/review/runtime/phab-transactions.ts";

const fixture = JSON.parse(readFileSync(new URL("../../../fixtures/phab-transactions.json", import.meta.url), "utf8")).result;

test("parseTransactions reads supported comments independent of transaction order", () => {
  const { comments, after } = parseTransactions(fixture);
  assert.equal(comments.length, 5);
  const byTx = new Map(comments.map((c) => [c.txId, c]));
  assert.equal(byTx.get(11494041)?.isDone, false);
  assert.equal(byTx.get(11425537)?.isNewFile, false);
  assert.equal(byTx.get(11425537)?.isDone, true);
  assert.equal(byTx.get(11502472)?.replyTo, "PHID-XCMT-n13");
  assert.equal(byTx.get(11494045)?.isDone, true);
  assert.equal(byTx.get(11494036)?.path, undefined);
  assert.equal(byTx.get(11494036)?.isNewFile, undefined);
  assert.equal(byTx.get(11494036)?.isDone, undefined);
  assert.equal(byTx.get(11494041)?.dateCreated, 1791221914);
  assert.equal(byTx.get(11494041)?.dateCreated, fixture.data.find((t: { id: number }) => t.id === 11494041).dateCreated);
  assert.equal(byTx.get(11494041)?.txId, 11494041);
  assert.equal(Math.max(...comments.map((c) => c.txId)), 11502472);
  assert.equal(after, "11502453");
});

test("parseTransactions skips removed/unsupported entries and validates its boundary", () => {
  const result = structuredClone(fixture);
  result.data[0].comments[0].removed = true;
  result.data.push({ id: 1, type: null, comments: [], fields: {} });
  assert.equal(parseTransactions(result).comments.length, 4);
  assert.equal(parseTransactions({ data: [], cursor: { after: null } }).after, null);
  assert.throws(() => parseTransactions(null));
  assert.throws(() => parseTransactions({}));
  assert.throws(() => parseTransactions({ data: {} }));
  assert.throws(() => parseTransactions({ data: [{ id: 1, type: "inline", comments: [{ phid: "C", version: 1, authorPHID: "U", content: { raw: "x" } }], fields: {} }], cursor: { after: null } }), /path/);
  assert.throws(() => parseTransactions({ data: [{ id: 1, type: "comment", comments: [{ phid: "C" }] }], cursor: { after: null } }), /malformed comment/);
});

test("fetchTransactions follows the cursor and concatenates pages", async () => {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const tx = (id: number) => ({ id, dateCreated: id, type: "comment", comments: [{ phid: `C${id}`, version: 1, authorPHID: "U", content: { raw: `body ${id}` }, removed: false }] });
  const pages = [
    { data: [tx(1)], cursor: { after: "9" } },
    { data: [tx(2)], cursor: { after: null } },
  ];
  const conduit = { call: async (method: string, params: Record<string, unknown>) => { calls.push({ method, params }); return pages.shift(); } };
  assert.deepEqual((await fetchTransactions(conduit as never, "PHID-DREV")).map((comment) => comment.txId), [1, 2]);
  assert.deepEqual(calls.map((call) => call.params), [{ objectIdentifier: "PHID-DREV" }, { objectIdentifier: "PHID-DREV", after: "9" }]);
  assert.equal(calls.length, 2);
});

const remote = (patch: Partial<RemoteComment> = {}): RemoteComment => ({ phid: "C", version: 1, authorPHID: "U", body: "hello", path: "a.ts", line: 4, diffId: 1, isNewFile: true, isDone: false, txId: 1, dateCreated: 10, ...patch });

test("storeRemoteComments is idempotent, revises edits and done toggles, and identifies our posts", () => {
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "test" });
  const first = storeRemoteComments(store, session.id, 7, [remote()], new Map([["U", "alice"]]), { phid: "U", posted: [] });
  assert.equal(first.length, 1);
  assert.equal(first[0]?.data.done, false);
  assert.equal(first[0]?.data.author, "alice");
  assert.equal(first[0]?.data.byMe, true);
  assert.equal(first[0]?.data.own, false);
  assert.equal(storeRemoteComments(store, session.id, 7, [remote()], new Map(), { phid: "U", posted: [] }).length, 0);
  const edited = storeRemoteComments(store, session.id, 7, [remote({ version: 2, body: "edited" })], new Map(), { phid: "U", posted: [] });
  const done = storeRemoteComments(store, session.id, 7, [remote({ version: 2, body: "edited", isDone: true })], new Map(), { phid: "U", posted: [] });
  const reopened = storeRemoteComments(store, session.id, 7, [remote({ version: 2, body: "edited", isDone: false })], new Map(), { phid: "U", posted: [] });
  assert.deepEqual([edited.length, done.length, reopened.length], [1, 1, 1]);
  assert.equal(done[0]?.data.done, true);
  assert.deepEqual(store.listLinks(session.id).map((l) => [l.from, l.to, l.kind]), [[edited[0]!.id, first[0]!.id, "revises"], [done[0]!.id, edited[0]!.id, "revises"], [reopened[0]!.id, done[0]!.id, "revises"]]);
  assert.equal(latestPhabComments(store.listArtifacts(session.id)).find((a) => a.data.phid === "C")?.id, reopened[0]?.id);
  const versions = storeRemoteComments(store, session.id, 7, [remote({ phid: "V", version: 2, body: "v2" }), remote({ phid: "V", version: 1, body: "v1" })], new Map(), { phid: "U", posted: [] });
  assert.deepEqual(versions.map((a) => a.data.body), ["v2"]);

  const ownInline = storeRemoteComments(store, session.id, 7, [remote({ phid: "OWN", body: "posted" })], new Map(), { phid: "U", posted: [{ body: "posted", path: "a.ts" }] });
  const ownGeneral = storeRemoteComments(store, session.id, 7, [remote({ phid: "OWN-G", body: "posted", path: undefined })], new Map(), { phid: "U", posted: [{ body: "posted", path: null }] });
  const other = storeRemoteComments(store, session.id, 7, [remote({ phid: "OTHER", authorPHID: "V", body: "posted" })], new Map(), { phid: "U", posted: [{ body: "posted", path: "a.ts" }] });
  const wrongPath = storeRemoteComments(store, session.id, 7, [remote({ phid: "PATH", body: "posted", path: "b.ts" })], new Map(), { phid: "U", posted: [{ body: "posted", path: "a.ts" }] });
  assert.deepEqual([ownInline[0]?.data.own, ownGeneral[0]?.data.own, other[0]?.data.own, wrongPath[0]?.data.own], [true, true, false, false]);
  assert.equal(latestPhabComments(store.listArtifacts(session.id)).some((a) => a.data.phid === "OWN"), false);
  assert.equal(storeRemoteComments(store, session.id, 7, [remote({ phid: "fallback", authorPHID: "UNKNOWN" })], new Map(), { phid: "U", posted: [] })[0]?.data.author, "UNKNOWN");
  store.close();
});

test("storeRemoteComments marks bot authors by username", () => {
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "test" });
  const authors = new Map([["B1", "reviewbot"], ["B2", "reviewhelper-bot"], ["B3", "ReviewBOT"], ["H", "abbott"], ["R", "robotics"]]);
  const stored = storeRemoteComments(store, session.id, 7, ["B1", "B2", "B3", "H", "R", "UNKNOWN"].map((authorPHID) => remote({ phid: authorPHID, authorPHID })), authors, { phid: "U", posted: [] });
  assert.deepEqual(stored.map((a) => a.data.bot), [true, true, true, false, false, false]);
  store.close();
});
