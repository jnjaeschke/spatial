import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../../src/runtime/store.ts";
import type { DiffData } from "../../../src/shared/types.ts";
import type { PhabCommentData } from "../../../src/plugins/review/shared/types.ts";
import type { ConduitClient } from "../../../src/plugins/review/runtime/conduit.ts";
import { postInlineReplies } from "../../../src/plugins/review/runtime/post-replies.ts";

function setup() {
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "test" });
  store.putArtifact<DiffData>({ sessionId: session.id, type: "Diff", status: "verified", data: {
    baseSha: "B", headSha: "H", commits: [{ sha: "H", subject: "change", body: "Differential Revision: https://phab.example.com/D7" }], files: [],
  }, provenance: { taskId: "test" } });
  const comment = store.putArtifact<PhabCommentData>({ sessionId: session.id, type: "PhabComment", status: "verified", data: {
    revision: 7, phid: "PHID-XCMT-1", version: 1, author: "alice", bot: false, body: "Please fix", path: "dom/a.cpp", line: 12, length: 2,
    diffId: 70, isNewFile: true, own: false, byMe: false, done: false, txId: 1, dateCreated: 1,
  }, provenance: { taskId: "test" } });
  const calls: [string, Record<string, unknown>][] = [];
  let nextId = 900;
  const makeConduit = () => ({ call: async (method: string, params: Record<string, unknown>) => { calls.push([method, params]); return { id: ++nextId }; } }) as unknown as ConduitClient;
  const rt = {
    store,
    emit: () => {},
    putArtifact: (_actor: string, artifact: Parameters<Store["putArtifact"]>[0]) => store.putArtifact(artifact),
    putLink: (_actor: string, link: Parameters<Store["putLink"]>[0]) => store.putLink(link),
  } as never;
  return { store, session, comment, calls, makeConduit, rt };
}

test("an inline reply becomes a draft inline on the commented line and a PostedReply", async () => {
  const x = setup();
  const result = await postInlineReplies(x.rt, x.session.id, [{ comment: x.comment, body: "Done." }], { makeConduit: x.makeConduit });
  assert.deepEqual(x.calls, [["differential.createinline", { revisionID: 7, diffID: 70, filePath: "dom/a.cpp", isNewFile: 1, lineNumber: 12, lineLength: 2, content: "Done." }]]);
  assert.deepEqual(result, { posted: 1, skipped: [] });
  const receipt = x.store.listArtifacts(x.session.id, "PostedReply")[0]!;
  assert.deepEqual(receipt.data, { comment: x.comment.id, body: "Done.", revision: 7, diff: 70, inlineId: 901 });
  assert.deepEqual(x.store.listLinks(x.session.id).map(({ from, to, kind }) => ({ from, to, kind })), [{ from: receipt.id, to: x.comment.id, kind: "about" }]);
  x.store.close();
});

test("general comments and replies already posted with the same body are skipped", async () => {
  const x = setup();
  const general = x.store.putArtifact<PhabCommentData>({ sessionId: x.session.id, type: "PhabComment", status: "verified", data: {
    revision: 7, phid: "PHID-XCMT-G", version: 1, author: "alice", bot: false, body: "General", own: false, byMe: false, done: false, txId: 2, dateCreated: 2,
  }, provenance: { taskId: "test" } });
  assert.deepEqual(await postInlineReplies(x.rt, x.session.id, [{ comment: general, body: "No draft" }], { makeConduit: x.makeConduit }), {
    posted: 0, skipped: [{ comment: general.id, reason: "general comment: Phabricator has no draft replies for it" }],
  });
  assert.deepEqual(await postInlineReplies(x.rt, x.session.id, [{ comment: x.comment, body: "Done." }], { makeConduit: x.makeConduit }), { posted: 1, skipped: [] });
  assert.deepEqual(await postInlineReplies(x.rt, x.session.id, [{ comment: x.comment, body: "Done." }], { makeConduit: x.makeConduit }), { posted: 0, skipped: [{ comment: x.comment.id, reason: "already posted" }] });
  assert.deepEqual(await postInlineReplies(x.rt, x.session.id, [{ comment: x.comment, body: "Actually fixed." }], { makeConduit: x.makeConduit }), { posted: 1, skipped: [] });
  assert.equal(x.calls.length, 2);
  x.store.close();
});

test("a revision without an arcrc token is an error naming the host", async () => {
  const x = setup();
  await assert.rejects(postInlineReplies(x.rt, x.session.id, [{ comment: x.comment, body: "Done." }], {
    makeConduit: (host) => { throw new Error(`No arcrc token for ${host}`); },
  }), /No arcrc token for https:\/\/phab\.example\.com/);
  x.store.close();
});
