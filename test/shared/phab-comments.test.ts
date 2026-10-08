import { test } from "node:test";
import assert from "node:assert/strict";
import { latestPhabComments, phabAnchorId, phabLatest, phabThread } from "../../src/shared/phab-comments.ts";
import type { Artifact, PhabCommentData } from "../../src/shared/types.ts";

const artifact = (id: string, data: Partial<PhabCommentData>): Artifact<PhabCommentData> => ({ id, sessionId: "S", type: "PhabComment", status: "verified", provenance: { taskId: "runtime" }, createdAt: id, data: { revision: 1, phid: "root", version: 1, author: "alice", bot: false, body: id, own: false, done: false, txId: 1, dateCreated: 1, ...data }, epoch: null});

test("Phabricator comment helpers preserve stable anchors and latest versions", () => {
  const root = artifact("root-v1", { phid: "root", txId: 1 });
  const revised = artifact("root-v2", { phid: "root", version: 2, txId: 1 });
  const done = artifact("root-done", { phid: "root", version: 2, done: true, txId: 1 });
  const reply = artifact("reply", { phid: "reply", replyTo: "root", txId: 3 });
  const ownReply = artifact("own-reply", { phid: "own-reply", replyTo: "root", own: true, txId: 2 });
  const orphan = artifact("orphan", { phid: "orphan", replyTo: "missing", txId: 4 });
  const artifacts = [root, revised, done, reply, ownReply, orphan];
  assert.equal(phabAnchorId(artifacts, "root"), "root-v1");
  assert.equal(phabLatest(artifacts, "root-v1")?.id, "root-done");
  assert.equal(phabLatest(artifacts, "other"), null);
  assert.deepEqual(phabThread(artifacts, "reply").map((a) => a.id), ["root-done", "reply"]);
  assert.deepEqual(phabThread(artifacts, "root-v1").map((a) => a.id), ["root-done", "reply"]);
  assert.deepEqual(phabThread(artifacts, "orphan").map((a) => a.id), ["orphan"]);
  assert.deepEqual(latestPhabComments(artifacts).map((a) => a.id), ["root-done", "reply", "orphan"]);
});
